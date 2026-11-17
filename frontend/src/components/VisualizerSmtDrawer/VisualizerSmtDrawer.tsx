import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import MonacoEditor from '@monaco-editor/react';
import {
    Button,
    Callout,
    Classes,
    ControlGroup,
    FormGroup,
    HTMLSelect,
    Icon,
    InputGroup,
    NumericInput,
    Tag,
    Tooltip,
} from '@blueprintjs/core';

import { clampPanelPosition, panelWidthFor, parsePanelLayout, type PanelBounds, type PanelLayout } from './panelLayout';
import { selectTheme } from '../../store/features/theme/themeSlice';
import { SmtDrawerProps } from '../../interfaces/interfaces';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectSmt, setSmt } from '../../store/features/proof/proofSlice';
import { selectSpinner } from '../../store/features/externalCmd/externalCmd';
import { selectLastRun } from '../../store/features/solver/solverSlice';
import { cancelBusy, runSolverAction } from '../../store/features/solver/actions';
import { PANEL_KEY, PANEL_LAYOUT_KEY, readPref, writePref } from '../../store/features/solver/prefs';
import {
    CVC5_DEFAULT_ARGS,
    VERIT_DEFAULT_ARGS,
    getBridgeHealth,
    getBridgeUrl,
    isCvc5WasmAvailable,
    isVeritWasmAvailable,
    setBridgeUrl,
} from '../../solvers';
import type { Backend, BridgeHealth, SolverId } from '../../solvers';

import '../../scss/VisualizerSmtDrawer.scss';

type OptionId = 'cvc5-wasm' | 'verit-wasm' | 'cvc5-bridge' | 'verit-bridge';

const OPTIONS: Record<OptionId, { label: string; solver: SolverId; backend: Backend }> = {
    'cvc5-wasm': { label: 'cvc5 (in browser, wasm)', solver: 'cvc5', backend: 'wasm' },
    'verit-wasm': { label: 'veriT (in browser, wasm)', solver: 'verit', backend: 'wasm' },
    'cvc5-bridge': { label: 'cvc5 (local bridge)', solver: 'cvc5', backend: 'bridge' },
    'verit-bridge': { label: 'veriT (local bridge)', solver: 'verit', backend: 'bridge' },
};

interface PanelPrefs {
    option: OptionId;
    extraArgs: Record<SolverId, string>;
    timeoutSec: number;
}

const DEFAULT_PREFS: PanelPrefs = {
    option: 'cvc5-wasm',
    extraArgs: { cvc5: '', verit: '' },
    timeoutSec: 60,
};

const loadPrefs = (): PanelPrefs => {
    const saved = readPref<Partial<PanelPrefs>>(PANEL_KEY, {});
    return {
        option: saved.option && saved.option in OPTIONS ? saved.option : DEFAULT_PREFS.option,
        extraArgs: { ...DEFAULT_PREFS.extraArgs, ...saved.extraArgs },
        timeoutSec: saved.timeoutSec && saved.timeoutSec > 0 ? saved.timeoutSec : DEFAULT_PREFS.timeoutSec,
    };
};

const FALLBACK_NAVBAR_HEIGHT = 50;
const FALLBACK_HEADER_HEIGHT = 40;

const navbarBottom = (): number =>
    document.querySelector('.' + Classes.NAVBAR)?.getBoundingClientRect().bottom || FALLBACK_NAVBAR_HEIGHT;

const VisualizerSmtDrawer: React.FC<SmtDrawerProps> = ({
    isOpen,
    setDrawerIsOpen,
    expandRequested,
    onExpandHandled,
}: SmtDrawerProps) => {
    const dispatch = useAppDispatch();
    const darkTheme = useAppSelector(selectTheme);
    const smt = useAppSelector(selectSmt);
    const busy = useAppSelector(selectSpinner) === 'busy';
    const lastRun = useAppSelector(selectLastRun);

    const [prefs, setPrefs] = useState(loadPrefs);
    const [health, setHealth] = useState<BridgeHealth | null | undefined>(undefined);
    const [wasmOk, setWasmOk] = useState(true);
    const [veritWasmOk, setVeritWasmOk] = useState(true);
    const [bridgeUrl, setBridgeUrlInput] = useState(getBridgeUrl);

    const updatePrefs = (patch: Partial<PanelPrefs>) => {
        const next = { ...prefs, ...patch };
        setPrefs(next);
        writePref(PANEL_KEY, next);
    };

    const loadHealth = useCallback(() => {
        getBridgeHealth().then(setHealth, () => setHealth(null));
    }, []);
    const refreshHealth = () => {
        setHealth(undefined);
        loadHealth();
    };

    useEffect(() => {
        isCvc5WasmAvailable().then(setWasmOk, () => setWasmOk(false));
        isVeritWasmAvailable().then(setVeritWasmOk, () => setVeritWasmOk(false));
        loadHealth();
    }, [loadHealth]);

    // Floating panel: position, minimized state and drag
    const panelRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const drag = useRef<{ dx: number; dy: number } | null>(null);
    const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
    const bounds = (): PanelBounds => ({
        panelWidth: panelWidthFor(window.innerWidth),
        headerHeight: headerRef.current?.offsetHeight || FALLBACK_HEADER_HEIGHT,
        minTop: navbarBottom(),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
    });
    const [layout, setLayout] = useState<PanelLayout>(() => {
        const saved = parsePanelLayout(readPref<unknown>(PANEL_LAYOUT_KEY, null));
        const b = bounds();
        const base = saved ?? { x: 0, y: b.minTop, minimized: false };
        return { ...clampPanelPosition(base, b), minimized: base.minimized };
    });
    const layoutRef = useRef(layout);
    useEffect(() => {
        layoutRef.current = layout;
    });

    const saveLayout = (next: PanelLayout) => writePref(PANEL_LAYOUT_KEY, next);
    const toggleMinimized = () => {
        const next = { ...layout, minimized: !layout.minimized };
        setLayout(next);
        saveLayout(next);
    };

    useEffect(() => {
        const onResize = () => {
            setViewport({ w: window.innerWidth, h: window.innerHeight });
            setLayout((l) => ({ ...l, ...clampPanelPosition(l, bounds()) }));
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Carcara needs the SMT problem: show the panel even if minimized
    useLayoutEffect(() => {
        if (!expandRequested) return;
        if (layoutRef.current.minimized) {
            const next = { ...layoutRef.current, minimized: false };
            setLayout(next);
            saveLayout(next);
        }
        onExpandHandled?.();
    }, [expandRequested, onExpandHandled]);

    useEffect(() => {
        panelRef.current?.focus();
    }, []);

    const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
        drag.current = { dx: e.clientX - layout.x, dy: e.clientY - layout.y };
        e.currentTarget.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    };
    const dragPosition = (e: React.PointerEvent<HTMLDivElement>, { dx, dy }: { dx: number; dy: number }) =>
        clampPanelPosition({ x: e.clientX - dx, y: e.clientY - dy }, bounds());
    const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!drag.current) return;
        const pos = dragPosition(e, drag.current);
        setLayout((l) => ({ ...l, ...pos }));
    };
    const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!drag.current) return;
        // Taken from the event: the last move may not have rendered yet
        const next = { ...layoutRef.current, ...dragPosition(e, drag.current) };
        drag.current = null;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        setLayout(next);
        saveLayout(next);
    };

    const onPanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        // Monaco closes its suggestion widget with Escape; leave it be
        if (panelRef.current?.querySelector('.suggest-widget.visible')) return;
        e.preventDefault();
        setDrawerIsOpen(false);
    };

    const { solver, backend } = OPTIONS[prefs.option];
    const defaults = solver === 'cvc5' ? CVC5_DEFAULT_ARGS : VERIT_DEFAULT_ARGS;

    // Why an option cannot be used, or null
    const disabledReason = useMemo(() => {
        const reasons: Record<OptionId, string | null> = {
            'cvc5-wasm': wasmOk ? null : 'The cvc5 WebAssembly build is not available in this deployment.',
            'verit-wasm': veritWasmOk
                ? null
                : 'The veriT WebAssembly build is not available in this deployment (run `make verit-wasm`).',
            'cvc5-bridge': null,
            'verit-bridge': null,
        };
        const bridgeReason = (tool: 'cvc5' | 'verit'): string | null => {
            if (health === undefined) return 'Checking the local bridge…';
            if (health === null) return `The local bridge is unreachable at ${getBridgeUrl()}.`;
            return health.tools[tool] ? null : `The bridge has no ${tool === 'cvc5' ? 'cvc5' : 'veriT'} configured.`;
        };
        reasons['cvc5-bridge'] = bridgeReason('cvc5');
        reasons['verit-bridge'] = bridgeReason('verit');
        return reasons;
    }, [wasmOk, veritWasmOk, health]);

    const currentDisabled = disabledReason[prefs.option];

    const run = () => {
        const extraArgs = prefs.extraArgs[solver].split(/\s+/).filter(Boolean);
        void dispatch(
            runSolverAction({ solver, backend, problem: smt, extraArgs, timeoutMs: prefs.timeoutSec * 1000 }),
        );
    };

    const applyBridgeUrl = () => {
        setBridgeUrl(bridgeUrl);
        setBridgeUrlInput(getBridgeUrl());
        refreshHealth();
    };

    const tools = health?.tools;
    const toolTag = (name: string, info: { version: string } | null | undefined) => (
        <Tag key={name} minimal intent={info ? 'success' : 'none'} style={{ marginRight: 4 }}>
            {info ? versionLabel(name, info.version) : `${name} missing`}
        </Tag>
    );

    if (!isOpen) return null;

    const minimized = layout.minimized;
    return (
        <div
            ref={panelRef}
            role="dialog"
            aria-label="SMT Input and Solvers"
            tabIndex={-1}
            className={`smt-drawer ${Classes.CARD} ${Classes.ELEVATION_3} ${darkTheme ? Classes.DARK : ''}`}
            style={{
                left: layout.x,
                top: layout.y,
                width: panelWidthFor(viewport.w),
                maxHeight: Math.max(0, viewport.h - layout.y),
            }}
            onKeyDown={onPanelKeyDown}
        >
            <div
                ref={headerRef}
                className="smt-header"
                onPointerDown={onHeaderPointerDown}
                onPointerMove={onHeaderPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
            >
                <Icon icon="code" />
                <span className="smt-title">SMT Input and Solvers</span>
                <Button
                    minimal
                    small
                    icon={minimized ? 'maximize' : 'minus'}
                    aria-label={minimized ? 'Restore SMT panel' : 'Minimize SMT panel'}
                    onClick={toggleMinimized}
                />
                <Button
                    minimal
                    small
                    icon="cross"
                    aria-label="Close SMT panel"
                    onClick={() => setDrawerIsOpen(false)}
                />
            </div>
            <div className="solver-panel" hidden={minimized}>
                <MonacoEditor
                    height="260px"
                    language="lisp"
                    value={smt}
                    onChange={(value) => dispatch(setSmt(value ?? ''))}
                    options={{
                        theme: darkTheme ? 'vs-dark' : 'vs',
                        minimap: { enabled: false },
                        automaticLayout: true,
                    }}
                />
                <div className="solver-form">
                    <FormGroup label="Solver">
                        <HTMLSelect
                            fill
                            value={prefs.option}
                            onChange={(e) => updatePrefs({ option: e.currentTarget.value as OptionId })}
                        >
                            {(Object.keys(OPTIONS) as OptionId[]).map((id) => (
                                <option key={id} value={id} disabled={disabledReason[id] !== null}>
                                    {OPTIONS[id].label}
                                    {disabledReason[id] ? ' (unavailable)' : ''}
                                </option>
                            ))}
                        </HTMLSelect>
                        {(Object.keys(OPTIONS) as OptionId[])
                            .filter((id) => disabledReason[id] !== null)
                            .map((id) => (
                                <Tooltip key={id} content={disabledReason[id] ?? ''} placement="bottom-start">
                                    <Tag minimal style={{ margin: '4px 4px 0 0' }}>
                                        {OPTIONS[id].label}: unavailable
                                    </Tag>
                                </Tooltip>
                            ))}
                    </FormGroup>

                    <FormGroup label="Default arguments" helperText="Always applied by the visualizer or the bridge.">
                        <pre className="solver-defaults">{defaults.join(' ')}</pre>
                    </FormGroup>
                    <FormGroup label="Extra arguments">
                        <InputGroup
                            placeholder="e.g. --tlimit=5000"
                            value={prefs.extraArgs[solver]}
                            onChange={(e) =>
                                updatePrefs({ extraArgs: { ...prefs.extraArgs, [solver]: e.target.value } })
                            }
                        />
                    </FormGroup>
                    <FormGroup label="Timeout (seconds)">
                        <NumericInput
                            min={1}
                            value={prefs.timeoutSec}
                            onValueChange={(n) => Number.isFinite(n) && n > 0 && updatePrefs({ timeoutSec: n })}
                            fill
                        />
                    </FormGroup>

                    <FormGroup
                        label="Local bridge"
                        helperText="Runs native cvc5, veriT and Carcara. See bridge/README.md."
                    >
                        <ControlGroup fill>
                            <InputGroup
                                placeholder="same origin (dev proxy)"
                                value={bridgeUrl}
                                onChange={(e) => setBridgeUrlInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && applyBridgeUrl()}
                            />
                            <Button
                                icon="refresh"
                                text="Refresh"
                                onClick={applyBridgeUrl}
                                loading={health === undefined}
                            />
                        </ControlGroup>
                        <div style={{ marginTop: 6 }}>
                            {health === undefined ? (
                                <Tag minimal>checking…</Tag>
                            ) : health === null ? (
                                <Tag minimal intent="danger">
                                    unreachable
                                </Tag>
                            ) : (
                                <>
                                    <Tag minimal intent="primary" style={{ marginRight: 4 }}>
                                        bridge {health.version}
                                    </Tag>
                                    {toolTag('cvc5', tools?.cvc5)}
                                    {toolTag('veriT', tools?.verit)}
                                    {toolTag('carcara', tools?.carcara)}
                                </>
                            )}
                        </div>
                    </FormGroup>

                    {lastRun ? (
                        <Callout
                            intent={
                                lastRun.status === 'unsat'
                                    ? 'success'
                                    : lastRun.status === 'error'
                                      ? 'danger'
                                      : 'warning'
                            }
                            title={`${lastRun.label}: ${lastRun.status} (${(lastRun.durationMs / 1000).toFixed(2)} s)`}
                        >
                            {lastRun.stderr.trim() || lastRun.status !== 'unsat' ? (
                                <pre className="solver-output">
                                    {[tail(lastRun.stderr), lastRun.status === 'unsat' ? '' : tail(lastRun.stdout)]
                                        .filter(Boolean)
                                        .join('\n---\n') || '(no output)'}
                                </pre>
                            ) : null}
                        </Callout>
                    ) : null}
                </div>
                <footer className="solver-footer">
                    <Button text="Cancel" icon="stop" disabled={!busy} onClick={cancelBusy} />
                    <Tooltip content={currentDisabled ?? ''} disabled={!currentDisabled}>
                        <Button
                            intent="primary"
                            icon="play"
                            text="Run"
                            disabled={Boolean(currentDisabled) || busy || !smt.trim()}
                            onClick={run}
                        />
                    </Tooltip>
                </footer>
            </div>
        </div>
    );
};

// "cvc5 1.4.2 [git ...]" -> "cvc5 1.4.2"; adds the name when the version lacks it
const versionLabel = (name: string, version: string): string => {
    const short = version.split(' [')[0];
    return short.toLowerCase().includes(name.toLowerCase()) ? short : `${name} ${short}`;
};

const tail = (text: string, max = 1200): string => {
    const t = text.trim();
    return t.length > max ? '...' + t.slice(-max) : t;
};

export default VisualizerSmtDrawer;
