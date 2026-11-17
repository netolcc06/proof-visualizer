import { letNamesIn } from '../../alethe';
import type { LetMap } from '../../alethe';

interface Line {
    value: string;
    indentLevel: number;
}

// Let names (whole symbols) found in `text`, keyed by their index
export function findLets(text: string, letMap: LetMap): { [index: number]: string } {
    const indices: { [index: number]: string } = {};
    letNamesIn(text, letMap).forEach(({ name, index }) => (indices[index] = name));
    return indices;
}

class Let {
    name: string;
    value: string;
    lines: Line[];
    biggerID: number;
    isExpanded: boolean;
    // Names are resolved lazily through `letsList`: a let may reference lets created after it
    externalLets: { [key: string]: { name: string; idx: number[] } };
    private letsList: { [key: string]: Let };
    private fullValue?: string;

    constructor(name: string, letText: string, letsList: { [key: string]: Let }, indices: { [key: number]: string }) {
        this.name = name;
        this.value = letText;
        this.lines = [{ value: letText, indentLevel: 0 }];
        this.biggerID = 0;
        this.isExpanded = false;
        this.letsList = letsList;

        this.externalLets = {};
        Object.keys(indices).forEach((key) => {
            const numKey = Number(key);
            const letName = indices[numKey];
            this.externalLets[letName] = {
                name: letName,
                idx: this.externalLets[letName] ? [...this.externalLets[letName].idx, numKey] : [numKey],
            };
        });
    }

    getTextWidth = (text: string, font: string): number => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        let size = 0;
        if (context) {
            context.font = font;
            size = context.measureText(text).width;
        }
        return size;
    };

    // Fully expanded text; `value` never changes, so it is cached
    private fullyExpanded = (): string => {
        if (this.fullValue === undefined) {
            let letText = this.value;
            // Replace from the last occurrence so the indices stay valid
            const occurrences = Object.values(this.externalLets)
                .flatMap(({ name, idx }) => idx.map((i) => ({ name, i })))
                .sort((x, y) => y.i - x.i);
            for (const { name, i } of occurrences) {
                const external = this.letsList[name];
                if (!external) continue;
                letText = letText.substring(0, i) + external.fullyExpanded() + letText.substring(i + name.length);
            }
            this.fullValue = letText;
        }
        return this.fullValue;
    };

    expandValue = (shouldUpdate = false): string => {
        const letText = this.fullyExpanded();
        if (shouldUpdate) {
            this.lines = [{ value: letText, indentLevel: 0 }];
            this.biggerID = 0;
        }
        return letText;
    };

    expandPartialy = (externalRef: Let, letIdx: number): string => {
        const key = externalRef.name;
        const indentedText = this.printLines();

        let lastLine = 0,
            count = 0,
            i;
        // Iterates through the first lines until the point we reach the changed line
        for (i = 0; i < this.lines.length; i++) {
            lastLine = this.lines[i].value.length + 4 * this.lines[i].indentLevel + 1;
            count += lastLine;
            if (letIdx < count) break;
        }
        // New index (points to the start of the line content (ignores initial indent white space))
        const newIdx = letIdx - (count - lastLine + 4 * this.lines[i].indentLevel);

        // Update the new line to the new content
        this.lines[i].value =
            this.lines[i].value.substring(0, newIdx) +
            externalRef.value +
            this.lines[i].value.substring(newIdx + key.length, this.lines[i].value.length);

        // Returns the indented text with the content to be replaced
        return (
            indentedText.substring(0, letIdx) +
            externalRef.value +
            indentedText.substring(letIdx + key.length, indentedText.length)
        );
    };

    shrinkValue = (): string => {
        this.lines = [{ value: this.value, indentLevel: 0 }];
        this.biggerID = 0;
        return this.value;
    };

    fitsTheWindow = (windowSize: number, font: string): boolean => {
        const line = this.lines[this.biggerID];
        const size = this.getTextWidth(`${'    '.repeat(line.indentLevel)}${line.value}`, font);
        return size < windowSize;
    };

    indent = (windowSize: number, mode: boolean, font: string): string => {
        let someDoesntFit;
        if (mode) someDoesntFit = true;
        else someDoesntFit = this.getTextWidth(this.lines[this.biggerID].value, font) < windowSize ? false : true;

        // While there are lines that doesn't fit the window size
        while (someDoesntFit) {
            const { lines, biggerID } = this;
            const newLines: Line[] = [];
            const thisLevel = lines[biggerID].indentLevel;
            const thisLine = lines[biggerID].value;

            let lastSpace = -1,
                lastUsedSpace = -1,
                lastOpenParenthesis = -1,
                indent = lines[biggerID].indentLevel - 1,
                biggestSize = 0,
                newBiggerID = 0;

            // Iterate through the line and calculate the indentation levels
            for (let i = 0; i < thisLine.length; i++) {
                const c = thisLine[i];
                // Opening parenthesis
                if (c === '(') {
                    indent++;
                    // If it's one of the arguments of the operation
                    if (indent === thisLevel + 1) lastOpenParenthesis = i;
                }
                // Closing parenthesis
                else if (c === ')') {
                    // If it's the end of this line
                    if (indent === thisLevel) {
                        // If the last argument was not inserted
                        if (thisLine[i - 1] !== ')') {
                            newLines.push({
                                value: thisLine.substring(lastSpace + 1, i),
                                indentLevel: indent + 1,
                            });
                        }
                        newLines.push({ value: ')', indentLevel: indent });
                    }
                    // If it's the end of this argument
                    else if (indent === thisLevel + 1) {
                        newLines.push({
                            value: thisLine.substring(lastOpenParenthesis, i + 1),
                            indentLevel: indent,
                        });
                    }
                    indent--;
                }
                // If a new space is detected in the current identation level
                //   and the last argument is not between parenthesis
                else if (c === ' ') {
                    lastSpace = i;

                    if (indent === thisLevel) {
                        if (thisLine[i - 1] !== ')') {
                            newLines.push({
                                value: thisLine.substring(lastUsedSpace + 1, i),
                                indentLevel: newLines.length ? indent + 1 : indent,
                            });
                        }
                        lastUsedSpace = i;
                    }
                }
            }

            // Insert new lines if happend some indentation
            if (newLines.length > 0) this.lines.splice(biggerID, 1, ...newLines);

            // Find the new biggest line
            this.lines.forEach((line, id) => {
                // Get the size of this new line
                const thisSize = this.getTextWidth(`${'    '.repeat(line.indentLevel)}${line.value}`, font);
                if (thisSize > biggestSize) {
                    biggestSize = thisSize;
                    newBiggerID = id;
                }
            });

            this.biggerID = newBiggerID;

            // If the biggest size fits the window or no new line was found (minimal indentation)
            if (biggestSize < windowSize || newLines.length < 1) someDoesntFit = false;
        }
        return this.printLines();
    };

    groupUp = (): string => {
        let original = '';
        // Group up all the lines into one single string
        this.lines.forEach((line, id, self) => {
            original += line.value;
            if (id < self.length - 1 && self[id + 1].value !== ')') {
                original += ' ';
            }
        });
        return original;
    };

    printLines = (): string => {
        return this.lines.reduce((ac, line) => (ac += `${'    '.repeat(line.indentLevel)}${line.value}\n`), '');
    };
}

export default Let;
