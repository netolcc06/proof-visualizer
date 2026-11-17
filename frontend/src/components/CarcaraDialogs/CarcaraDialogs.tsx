import React, { useEffect, useState } from 'react';
import {
    Button,
    Callout,
    Classes,
    Dialog,
    DialogBody,
    DialogFooter,
    FileInput,
    FormGroup,
    NumericInput,
    Radio,
    RadioGroup,
    Switch,
    Tag,
    TextArea,
} from '@blueprintjs/core';

import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectTheme } from '../../store/features/theme/themeSlice';
import {
    selectCarcaraBackend,
    selectCheckReport,
    selectRare,
    selectRareDialogOpen,
    selectSliceDialog,
    setCheckReport,
    setRareDialogOpen,
    setSliceDialog,
} from '../../store/features/solver/solverSlice';
import type { CheckReport } from '../../store/features/solver/solverSlice';
import {
    MAX_DISTANCE,
    checkSliceAction,
    elaborateSliceAction,
    saveCarcaraBackend,
    saveRare,
} from '../../store/features/solver/actions';
import { getBridgeHealth, getBridgeUrl, isCarcaraWasmAvailable } from '../../solvers';
import type { Backend, BridgeHealth } from '../../solvers';
import '../../scss/CarcaraDialogs.scss';

const VERDICTS: Record<
    CheckReport['verdict'],
    { text: string; intent: 'success' | 'warning' | 'danger'; note: string }
> = {
    valid: { text: 'Valid', intent: 'success', note: 'Carcara accepted every step.' },
    holey: {
        text: 'Valid, with holes',
        intent: 'warning',
        note: 'The proof is valid but contains hole steps that were not checked.',
    },
    invalid: { text: 'Invalid', intent: 'danger', note: 'Carcara rejected the proof.' },
    error: { text: 'Error', intent: 'danger', note: 'Carcara did not finish (timeout or internal error).' },
};

const CheckReportDialog: React.FC = () => {
    const dispatch = useAppDispatch();
    const darkTheme = useAppSelector(selectTheme);
    const report = useAppSelector(selectCheckReport);
    const verdict = report ? VERDICTS[report.verdict] : null;
    const close = () => dispatch(setCheckReport(null));

    return (
        <Dialog
            isOpen={Boolean(report)}
            onClose={close}
            title={report?.title ?? ''}
            icon="endorsed"
            className={darkTheme ? Classes.DARK : ''}
            style={{ width: 640 }}
        >
            {report && verdict ? (
                <>
                    <DialogBody>
                        <Callout intent={verdict.intent} title={verdict.text}>
                            {verdict.note} <Tag minimal>{(report.durationMs / 1000).toFixed(2)} s</Tag>
                            {report.backend ? (
                                <Tag minimal style={{ marginLeft: 4 }}>
                                    {report.backend === 'wasm' ? 'in browser (wasm)' : 'local bridge'}
                                </Tag>
                            ) : null}
                        </Callout>
                        {report.note ? (
                            <Callout intent="warning" style={{ marginTop: 12 }}>
                                {report.note}
                            </Callout>
                        ) : null}
                        <FormGroup label="Carcara output (stderr)" style={{ marginTop: 12 }}>
                            <pre className="tool-output">
                                {report.stderr.trim() || report.stdout.trim() || '(empty)'}
                            </pre>
                        </FormGroup>
                    </DialogBody>
                    <DialogFooter actions={<Button text="Close" onClick={close} />} />
                </>
            ) : null}
        </Dialog>
    );
};

// Where Carcara runs. Unset = automatic: in the browser when the wasm build is deployed, else the local bridge.
const BackendChoice: React.FC<{ isOpen: boolean }> = ({ isOpen }) => {
    const dispatch = useAppDispatch();
    const chosen = useAppSelector(selectCarcaraBackend);
    const [wasmOk, setWasmOk] = useState<boolean | undefined>(undefined);
    const [health, setHealth] = useState<BridgeHealth | null | undefined>(undefined);

    useEffect(() => {
        if (!isOpen) return;
        isCarcaraWasmAvailable().then(setWasmOk, () => setWasmOk(false));
        getBridgeHealth().then(setHealth, () => setHealth(null));
    }, [isOpen]);

    const effective: Backend = chosen ?? (wasmOk ? 'wasm' : 'bridge');
    const bridgeHelp =
        health === undefined
            ? 'Checking the local bridge…'
            : health === null
              ? `The local bridge is unreachable at ${getBridgeUrl() || 'this origin'}.`
              : health.tools.carcara
                ? 'Native Carcara; needed for steps that call an external solver.'
                : 'The bridge has no Carcara configured.';

    return (
        <FormGroup
            label="Run Carcara"
            helperText={chosen ? undefined : 'Default: in the browser when available, else the local bridge.'}
        >
            <RadioGroup
                selectedValue={effective}
                onChange={(e) => dispatch(saveCarcaraBackend(e.currentTarget.value as Backend))}
            >
                <Radio
                    value="wasm"
                    label={
                        wasmOk === false ? 'In browser (wasm) - unavailable in this deployment' : 'In browser (wasm)'
                    }
                    disabled={wasmOk === false}
                />
                <Radio value="bridge" label={`Local bridge - ${bridgeHelp}`} />
            </RadioGroup>
        </FormGroup>
    );
};

const RareDialog: React.FC = () => {
    const dispatch = useAppDispatch();
    const darkTheme = useAppSelector(selectTheme);
    const isOpen = useAppSelector(selectRareDialogOpen);
    const rare = useAppSelector(selectRare);
    const [text, setText] = useState(rare.text);
    const [useDefault, setUseDefault] = useState(rare.useBridgeDefault);
    const [wasOpen, setWasOpen] = useState(false);

    // Reload the stored values each time the dialog opens
    if (isOpen !== wasOpen) {
        setWasOpen(isOpen);
        if (isOpen) {
            setText(rare.text);
            setUseDefault(rare.useBridgeDefault);
        }
    }

    const close = () => dispatch(setRareDialogOpen(false));
    const save = () => {
        dispatch(saveRare({ text, useBridgeDefault: useDefault }));
        close();
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={close}
            title="Carcara settings"
            icon="cog"
            className={darkTheme ? Classes.DARK : ''}
            style={{ width: 640 }}
        >
            <DialogBody>
                <BackendChoice isOpen={isOpen} />
                <Switch
                    label="Use the default RARE file (bundled cvc5 rules)"
                    checked={useDefault}
                    onChange={(e) => setUseDefault(e.currentTarget.checked)}
                />
                <FormGroup
                    label="Custom RARE file (.rare)"
                    helperText="Used as the RARE file by either backend. Stored in this browser."
                >
                    <FileInput
                        fill
                        text="Upload a .rare file"
                        disabled={useDefault}
                        onInputChange={(e) => {
                            const file = e.currentTarget.files?.[0];
                            if (file) void file.text().then(setText);
                        }}
                    />
                    <TextArea
                        fill
                        rows={12}
                        className="tool-output"
                        disabled={useDefault}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        style={{ marginTop: 8 }}
                    />
                </FormGroup>
            </DialogBody>
            <DialogFooter
                actions={
                    <>
                        <Button text="Cancel" onClick={close} />
                        <Button intent="primary" text="Save" onClick={save} />
                    </>
                }
            />
        </Dialog>
    );
};

type DistanceMode = 'direct' | 'number' | 'whole';

const SliceDialog: React.FC = () => {
    const dispatch = useAppDispatch();
    const darkTheme = useAppSelector(selectTheme);
    const dialog = useAppSelector(selectSliceDialog);
    const [distanceMode, setDistanceMode] = useState<DistanceMode>('whole');
    const [distance, setDistance] = useState(3);
    const [mode, setMode] = useState<'splice' | 'open'>('splice');

    const close = () => dispatch(setSliceDialog(null));
    const elaborate = dialog?.action === 'elaborate';
    const run = () => {
        if (!dialog) return;
        const maxDistance = distanceMode === 'direct' ? 0 : distanceMode === 'whole' ? MAX_DISTANCE : distance;
        close();
        void dispatch(
            elaborate
                ? elaborateSliceAction({ from: dialog.from, maxDistance, mode })
                : checkSliceAction({ from: dialog.from, maxDistance }),
        );
    };

    return (
        <Dialog
            isOpen={Boolean(dialog)}
            onClose={close}
            title={`${elaborate ? 'Elaborate' : 'Check'} slice from ${dialog?.from ?? ''}`}
            icon="cut"
            className={darkTheme ? Classes.DARK : ''}
            style={{ width: 460 }}
        >
            <DialogBody>
                <RadioGroup
                    label="Max distance from the step"
                    selectedValue={distanceMode}
                    onChange={(e) => setDistanceMode(e.currentTarget.value as DistanceMode)}
                >
                    <Radio value="direct" label="Direct premises only (0)" />
                    <Radio value="number" label="Up to N steps away">
                        {distanceMode === 'number' ? (
                            <NumericInput
                                min={0}
                                value={distance}
                                onValueChange={(n) => setDistance(Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0)}
                                style={{ width: 90, marginLeft: 8 }}
                            />
                        ) : null}
                    </Radio>
                    <Radio value="whole" label="Whole sub-proof" />
                </RadioGroup>
                {elaborate ? (
                    <RadioGroup
                        label="Result"
                        selectedValue={mode}
                        onChange={(e) => setMode(e.currentTarget.value as 'splice' | 'open')}
                    >
                        <Radio value="splice" label="Splice into the proof (new steps are highlighted)" />
                        <Radio value="open" label="Open the slice only (replaces the current proof)" />
                    </RadioGroup>
                ) : null}
            </DialogBody>
            <DialogFooter
                actions={
                    <>
                        <Button text="Cancel" onClick={close} />
                        <Button intent="primary" text={elaborate ? 'Elaborate' : 'Check'} onClick={run} />
                    </>
                }
            />
        </Dialog>
    );
};

const CarcaraDialogs: React.FC = () => (
    <>
        <CheckReportDialog />
        <RareDialog />
        <SliceDialog />
    </>
);

export default CarcaraDialogs;
