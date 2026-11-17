// Navbar element ids, in the left-to-right order they are rendered
export const divsIds = [
    'proof-visualizer-name',
    'upload-proof-bt',
    'examples-bt',
    'input-smt-bt',
    'file-name-title',
    'command',
    'style-bt',
    'visualizers-bt',
    'download-bt',
    'carcara-bt',
    'switch-button-dark-theme',
    'main-navbar',
];

// One entry per step, one string per page. '\0name\0url\0' marks a link (first step only)
export const tutorials: string[][] = [
    [
        'This website visualizes Alethe proofs produced by SMT solvers such as cvc5 and veriT. It was developed by \0Vinícius Braga Freire\0https://github.com/vinciusb\0, \0Diego Della Rocca\0https://github.com/diegodrc\0 and \0Haniel Barbosa\0https://homepages.dcc.ufmg.br/~hbarbosa/\0. It was funded by AWS.',
    ],
    [
        'Upload a proof to visualize it.',
        'Open an Alethe proof (.alethe, .proof or .txt) or a saved session (.json). You can also attach the .smt2 problem.',
        'The .json file is created by Download > Session (JSON).',
    ],
    ['Open an example proof, produced by cvc5 or veriT.'],
    [
        'Opens the "SMT Input and Solvers" panel, where you edit the SMT problem and run a solver to get a new proof.',
        'cvc5 runs in the browser (WebAssembly). cvc5 and veriT can also run through the local bridge.',
    ],
    ['This is the name of the current proof.'],
    [
        'This is the command box. Commands transform the proof and change how you read it.',
        "Click the '?' button to see all the available commands.",
    ],
    [
        'Changes the way the proof is presented.',
        "The graph style is the default and it's where the command transformations happen.",
        "In the directory style each proof node is a 'folder' and its children are inside it.",
    ],
    [
        'Here you have access to 3 visualizers:',
        'View: changes the way the proof nodes are visualized.',
        'Let Map: lists the terms with a short name, from :named annotations and define-fun definitions (e.g.: @p_1 = (and A B)).',
        'Theory Lemma: lists all the theory lemmas in the proof.',
    ],
    [
        'Download the proof in different formats.',
        'Alethe is the proof itself, in the Alethe format.',
        'Session (JSON) saves the proof, the SMT problem and the visual state (node positions, colors and foldings), so you can reopen it later.',
        'PNG and SVG (whole graph) export the visible proof as an image, whatever the current zoom. They need the Graph style.',
        'Select region… lets you drag a rectangle over the graph and save just that area as PNG or SVG. Esc cancels.',
    ],
    [
        'Carcara menu: check and elaborate the proof, in the browser (wasm) or through the local bridge.',
        'Check proof validates the proof, and Elaborate proof expands it into a more detailed one.',
        'Carcara settings chooses where Carcara runs (in the browser or on the local bridge) and lets you provide extra RARE rewrite rules. Revert returns to the previous proof.',
    ],
    ['Switches between dark and light mode.'],
    [
        'On the canvas, every step has a color that shows which component it belongs to: SAT refutation, clausification (CNF), theory lemmas, preprocessing, input and rewriting. The legend lists them.',
        'Right-click a node for more actions: fold or unfold, "Elaborate slice from here" and "Check slice from here".',
        'CTRL+Z:\n when the Canvas is on focus, undo some actions: fold, unfold, hide, color and move',
        "CTRL+SHIFT+S:\n when the Canvas is on focus, open a selection tool allowing the user to select the nodes inside the selected area. Pressing again this shortcut turns the tool off. To select a node it's necessary to select the top-left corner.",
        'CTRL+SHIFT+U:\n similar to the previous command, allow the user to unselect nodes in a given area.',
    ],
];
