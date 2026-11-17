import React, { useEffect, useReducer, useRef, useState } from 'react';

import {
    Classes,
    Intent,
    OverlayToaster,
    Button,
    Overlay2,
    Position,
    Spinner,
    type OverlayToaster as OverlayToasterType,
} from '@blueprintjs/core';

import VisualizerNavbar from '../VisualizerNavbar/VisualizerNavbar';
import VisualizerDialog from '../VisualizerDialog/VisualizerDialog';
import VisualizerStage from '../VisualizerStage/VisualizerStage';
import VisualizersDrawer from '../VisualizersDrawer/VisualizersDrawer';

import { useAppSelector } from '../../store/hooks';
import { selectTheme } from '../../store/features/theme/themeSlice';
import VisualizerTutorial from '../VisualizerTutorial/VisualizerTutorial';
import VisualizerSmtDrawer from '../VisualizerSmtDrawer/VisualizerSmtDrawer';
import CarcaraDialogs from '../CarcaraDialogs/CarcaraDialogs';
import { selectBusyLabel, selectSpinner } from '../../store/features/externalCmd/externalCmd';
import { selectPanelRequest, selectToast } from '../../store/features/solver/solverSlice';
import { cancelBusy } from '../../store/features/solver/actions';

const App: React.FC = () => {
    const [dialogIsOpen, setDialogIsOpen] = useState(true);
    const [inTutorial, setInTutorial] = useState(false);
    const [drawerIsOpen, setDrawerOpenState] = useState(false);
    const [smtDrawerIsOpen, setSmtDrawerIsOpen] = useState(false);
    const [, disableAllDrawers] = useReducer(() => {
        if (dialogIsOpen) setDialogIsOpen(false);
        if (inTutorial) setInTutorial(false);
        if (drawerIsOpen) setDrawerOpenState(false);
        if (smtDrawerIsOpen) setSmtDrawerIsOpen(false);
        return null;
    }, null);
    const darkTheme = useAppSelector(selectTheme);
    const spinner = useAppSelector(selectSpinner);
    const busyLabel = useAppSelector(selectBusyLabel);
    const toast = useAppSelector(selectToast);
    const panelRequest = useAppSelector(selectPanelRequest);

    // Toaster
    const toasterRef = useRef<OverlayToasterType>(null);

    const addErrorToast = (err: string) => {
        toasterRef.current?.show({ icon: 'warning-sign', intent: Intent.DANGER, message: err });
    };

    // Toasts and panel requests raised by the solver/Carcara actions
    useEffect(() => {
        if (toast) toasterRef.current?.show({ intent: toast.intent, message: toast.message, timeout: 6000 });
    }, [toast]);

    // Only Carcara requests expand a minimized panel, not the navbar examples
    const [expandSmtPanel, setExpandSmtPanel] = useState(false);
    const [seenPanelRequest, setSeenPanelRequest] = useState(panelRequest);
    if (panelRequest !== seenPanelRequest) {
        setSeenPanelRequest(panelRequest);
        setSmtDrawerIsOpen(true);
        setExpandSmtPanel(true);
    }

    useEffect(() => {
        document.getElementsByClassName(Classes.OVERLAY)[0]
            ? (document.getElementsByClassName(Classes.OVERLAY)[0].className = '')
            : null;
    }, [drawerIsOpen]);

    return (
        <div className={darkTheme ? Classes.DARK : ''} style={{ height: '100%' }}>
            <VisualizerTutorial inTutorial={inTutorial} setInTutorial={setInTutorial} />
            <OverlayToaster position={Position.TOP} ref={toasterRef} />
            <VisualizerNavbar
                setDialogIsOpen={setDialogIsOpen}
                setDrawerIsOpen={setDrawerOpenState}
                addErrorToast={addErrorToast}
                inTutorial={inTutorial}
                setInTutorial={setInTutorial}
                setSmtDrawerIsOpen={setSmtDrawerIsOpen}
            />
            <VisualizerDialog
                dialogIsOpen={dialogIsOpen}
                setDialogIsOpen={setDialogIsOpen}
                addErrorToast={addErrorToast}
            />
            <VisualizerStage disableExternalDrawers={disableAllDrawers} />
            {drawerIsOpen ? (
                <VisualizersDrawer drawerIsOpen={drawerIsOpen} setDrawerIsOpen={setDrawerOpenState}></VisualizersDrawer>
            ) : null}
            {smtDrawerIsOpen ? (
                <VisualizerSmtDrawer
                    isOpen={smtDrawerIsOpen}
                    setDrawerIsOpen={setSmtDrawerIsOpen}
                    expandRequested={expandSmtPanel}
                    onExpandHandled={() => setExpandSmtPanel(false)}
                />
            ) : null}
            <CarcaraDialogs />
            <Overlay2 isOpen={spinner !== 'off'} className="spinner-overlay">
                <div className="overlay-container">
                    <div className="spinner-info">
                        <h1>{spinner === 'busy' ? busyLabel : 'rendering graph!'}</h1>
                        <Spinner intent={spinner === 'busy' ? 'primary' : 'success'} size={80} />
                        {spinner === 'busy' ? (
                            <Button icon="stop" text="Cancel" onClick={cancelBusy} style={{ marginTop: 20 }} />
                        ) : null}
                    </div>
                </div>
            </Overlay2>
        </div>
    );
};

export default App;
