import React, { useState, useReducer, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { MaybeElement } from '@blueprintjs/core/lib/esm/common/props';
import { IconName } from '@blueprintjs/core/lib/esm/components/icon/icon';

import { Button, Classes, Dialog, FileInput, FormGroup, Intent } from '@blueprintjs/core';

import '../../scss/VisualizerDialog.scss';
import { selectTheme } from '../../store/features/theme/themeSlice';
import { loadProof } from '../../store/features/proof/loadProof';
import { VisualizerDialogProps } from '../../interfaces/interfaces';

interface UploadedFile {
    name: string;
    text: string;
}

const PROOF_EXTENSIONS = ['alethe', 'proof', 'txt', 'json'];
const SMT_EXTENSIONS = ['smt2', 'smt'];

interface DialogProps {
    icon: IconName | MaybeElement;
    title: React.ReactNode;
}

const readUploadedFileAsText = (inputFile: File) => {
    const temporaryFileReader = new FileReader();

    return new Promise((resolve, reject) => {
        temporaryFileReader.onerror = () => {
            temporaryFileReader.abort();
            reject(new DOMException('Problem parsing input file.'));
        };

        temporaryFileReader.onload = () => {
            resolve(temporaryFileReader.result);
        };
        temporaryFileReader.readAsText(inputFile);
    });
};

const VisualizerDialog: React.FC<VisualizerDialogProps> = ({
    dialogIsOpen,
    setDialogIsOpen,
    addErrorToast,
}: VisualizerDialogProps) => {
    const darkTheme = useAppSelector(selectTheme);
    const dispatch = useAppDispatch();

    const [inputIsFocused, setInputIsFocused] = useState(false);
    const [proofFile, setProofFile] = useState<UploadedFile | null>(null);
    const [smtFile, setSmtFile] = useState<UploadedFile | null>(null);
    const [[focusFlag, flagCount], setFocusFlag] = useReducer(
        (state: number[], newFlag: number): number[] => [newFlag, state[1] + 1],
        [0, 0],
    );

    useEffect(() => {
        if (dialogIsOpen) setFocusFlag(1);
    }, [dialogIsOpen]);

    useEffect(() => {
        const className = focusFlag === 1 ? Classes.DIALOG_BODY + ' dialog-body' : Classes.DIALOG_FOOTER_ACTIONS;
        if (focusFlag !== 1 && focusFlag !== 2) return;
        // The dialog content is portaled, so it may not exist yet: retry for a few frames
        let tries = 0;
        let raf = 0;
        const focusFirst = () => {
            const el = document.getElementsByClassName(className)[0];
            if (el?.childNodes[0]) (el.childNodes[0] as HTMLElement).focus?.();
            else if (tries++ < 20) raf = requestAnimationFrame(focusFirst);
        };
        focusFirst();
        return () => cancelAnimationFrame(raf);
    }, [flagCount]);

    const closeDialog = () => {
        setDialogIsOpen(false);
        setProofFile(null);
        setSmtFile(null);
    };

    const extOf = (name: string): string => name.split('.').slice(-1)[0].toLowerCase();

    const readFile = async (input: HTMLInputElement, allowed: string[], setFile: (f: UploadedFile) => void) => {
        const file = input.files?.[0];
        if (!file) return;
        if (!allowed.includes(extOf(file.name))) {
            addErrorToast(`Sorry! Only ${allowed.map((e) => '.' + e).join(', ')} files are supported here.`);
            return;
        }

        try {
            setFile({ name: file.name, text: (await readUploadedFileAsText(file)) as string });
            // If succeded, set the focus of the page to the upload button
            setFocusFlag(2);
        } catch (er: any) {
            addErrorToast(er.message);
        }
    };

    const fileInput = (
        file: UploadedFile | null,
        placeholder: string,
        allowed: string[],
        setFile: (f: UploadedFile) => void,
        first: boolean,
    ) => (
        <FileInput
            style={{
                outline: first && inputIsFocused ? '2px  white solid' : '',
                borderRadius: '3px',
            }}
            text={file ? file.name : placeholder}
            hasSelection={file !== null}
            inputProps={{ accept: allowed.map((e) => '.' + e).join(',') }}
            onInputChange={(e) => readFile(e.target as HTMLInputElement, allowed, setFile)}
            fill={true}
            onFocus={(e) => {
                e.stopPropagation();
                if (first) setInputIsFocused(true);
            }}
            onBlur={(e) => {
                e.stopPropagation();
                if (first) setInputIsFocused(false);
            }}
        />
    );

    const dialogProps: DialogProps = { icon: 'upload', title: 'Upload Proof' };
    const dialogBody = (
        <>
            <p>
                Open an Alethe proof (.alethe, .proof, .txt) or a saved session (.json). Optionally attach the SMT-LIB
                problem (.smt2) to check or slice the proof later.
            </p>
            <FormGroup label="Proof">
                {fileInput(proofFile, 'Choose proof...', PROOF_EXTENSIONS, setProofFile, true)}
            </FormGroup>
            <FormGroup label="SMT problem (optional)">
                {fileInput(smtFile, 'Choose problem...', SMT_EXTENSIONS, setSmtFile, false)}
            </FormGroup>
        </>
    );
    const succesButton = (
        <Button
            onClick={() => {
                if (!proofFile) return;
                const result = dispatch(loadProof({ name: proofFile.name, text: proofFile.text, smt: smtFile?.text }));
                if (result.ok) closeDialog();
                else addErrorToast(result.error);
            }}
            intent={Intent.SUCCESS}
            disabled={!proofFile}
        >
            Upload Proof
        </Button>
    );

    return (
        <>
            <Dialog
                className={darkTheme ? Classes.DARK : ''}
                isOpen={dialogIsOpen}
                onClose={(): void => closeDialog()}
                usePortal={true}
                {...dialogProps}
            >
                <div className={Classes.DIALOG_BODY + ' dialog-body'}>{dialogBody}</div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>{succesButton}</div>
                </div>
            </Dialog>
        </>
    );
};

export default VisualizerDialog;
