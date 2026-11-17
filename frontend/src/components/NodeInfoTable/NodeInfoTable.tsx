import type { JSX } from 'react';
import React, { useEffect, useReducer } from 'react';
import { Classes, Icon, Collapse, Pre } from '@blueprintjs/core';

import { useAppSelector } from '../../store/hooks';
import { selectLetMap } from '../../store/features/proof/proofSlice';
import { NodeInfo } from '../../interfaces/interfaces';
import { renderLetKind, ClusterKind } from '../../interfaces/enum';
import { CLUSTER_STYLE } from '../../interfaces/clusterStyle';
import { findLets } from '../VisualizerLetDrawer/let';
import LetRender from '../VisualizerLetDrawer/LetRender';

interface NodeInfoTableProps {
    nodeInfo: NodeInfo;
    ruleHelper: (rule: string) => string;
}

type LetExpansion = [boolean, boolean];
type LetAction = { type: renderLetKind; payload: boolean };

const letReducer = (state: LetExpansion, { type, payload }: LetAction): LetExpansion =>
    state.map((_, i) => i === type && payload) as LetExpansion;

const NodeInfoTable: React.FC<NodeInfoTableProps> = ({ nodeInfo, ruleHelper }: NodeInfoTableProps) => {
    const letMap = useAppSelector(selectLetMap);
    const [ruleHelperIsOpen, toggleRuleHelper] = useReducer((open: boolean, value?: boolean) => value ?? !open, false);
    const [[expandArgs, revertArgs], dispatchArgsExpansion] = useReducer(letReducer, [false, false]);
    const [[expandConc, revertConc], dispatchConcExpansion] = useReducer(letReducer, [false, false]);

    // Collapse the rule help when another node is shown
    useEffect(() => toggleRuleHelper(false), [nodeInfo.id]);

    const hasLets = (text: string): boolean => Object.keys(findLets(text, letMap)).length > 0;
    const argsHaveLets = hasLets(nodeInfo.args);
    const concHasLets = hasLets(nodeInfo.conclusion);
    // Remount the let renderers when another node is shown
    const renderKey = `${nodeInfo.id}:${nodeInfo.stepId}`;
    const isPi = Boolean(nodeInfo.nHided);
    const component = nodeInfo.clusterType !== ClusterKind.NONE ? CLUSTER_STYLE[nodeInfo.clusterType] : null;

    const letIcons = (dispatch: React.Dispatch<LetAction>, show: boolean): JSX.Element | null =>
        show ? (
            <>
                <Icon
                    id="icon"
                    icon="translate"
                    onClick={() => dispatch({ type: renderLetKind.EXPAND, payload: true })}
                />
                <Icon id="icon" icon="undo" onClick={() => dispatch({ type: renderLetKind.REVERT, payload: true })} />
            </>
        ) : null;

    const letValue = (
        text: string,
        hasLet: boolean,
        id: number,
        expand: boolean,
        revert: boolean,
        dispatch: React.Dispatch<LetAction>,
    ): JSX.Element | string =>
        hasLet ? (
            <LetRender
                key={`${renderKey}:${id}`}
                id={id}
                toRender={text}
                letMap={letMap}
                shouldExpand={expand}
                shouldRevert={revert}
                dispatchExpansion={dispatch}
            />
        ) : (
            text
        );

    return (
        <table
            id="table-node-info"
            className={`${Classes.HTML_TABLE} ${Classes.HTML_TABLE_BORDERED} ${Classes.HTML_TABLE_STRIPED}`}
            style={{ width: '100%' }}
        >
            <thead>
                <tr>
                    <th>Property</th>
                    <th>Value</th>
                </tr>
            </thead>
            <tbody>
                {nodeInfo.stepId && !isPi ? (
                    <tr>
                        <td>
                            <strong>STEP</strong>
                        </td>
                        <td>{nodeInfo.stepId}</td>
                    </tr>
                ) : null}
                {component ? (
                    <tr>
                        <td>
                            <strong>COMPONENT</strong>
                        </td>
                        <td>
                            <span
                                style={{
                                    display: 'inline-block',
                                    width: 12,
                                    height: 12,
                                    marginRight: 6,
                                    verticalAlign: 'middle',
                                    border: '1px solid #555',
                                    background: component.color,
                                }}
                            />
                            {component.label}
                        </td>
                    </tr>
                ) : null}
                <tr>
                    <td>
                        <strong>RULE </strong>
                        <Icon id="icon" icon="help" onClick={() => toggleRuleHelper()} />
                    </td>
                    <td>
                        {nodeInfo.rule}
                        <Collapse isOpen={ruleHelperIsOpen}>
                            <Pre style={{ maxHeight: '300px', overflow: 'auto' }} id="pre-rule">
                                {ruleHelper(nodeInfo.rule)}
                            </Pre>
                        </Collapse>
                    </td>
                </tr>

                {nodeInfo.args && (
                    <tr>
                        <td>
                            <strong>ARGS</strong> {letIcons(dispatchArgsExpansion, argsHaveLets)}
                        </td>
                        <td style={{ maxHeight: '300px', overflow: 'auto' }}>
                            {letValue(nodeInfo.args, argsHaveLets, 1, expandArgs, revertArgs, dispatchArgsExpansion)}
                        </td>
                    </tr>
                )}

                <tr>
                    <td style={{ maxHeight: '300px', overflow: 'auto' }}>
                        <strong>CONCLUSION</strong> {letIcons(dispatchConcExpansion, concHasLets)}
                    </td>
                    <td style={{ maxHeight: '300px', overflow: 'auto' }}>
                        {letValue(nodeInfo.conclusion, concHasLets, 0, expandConc, revertConc, dispatchConcExpansion)}
                    </td>
                </tr>

                {nodeInfo.premises.length ? (
                    <tr>
                        <td>
                            <strong>PREMISES</strong>
                        </td>
                        <td>{nodeInfo.premises.join(', ')}</td>
                    </tr>
                ) : null}

                {nodeInfo.discharge.length ? (
                    <tr>
                        <td>
                            <strong>DISCHARGE</strong>
                        </td>
                        <td>{nodeInfo.discharge.join(', ')}</td>
                    </tr>
                ) : null}

                {nodeInfo.anchorPath.length ? (
                    <tr>
                        <td>
                            <strong>ANCHOR</strong>
                        </td>
                        <td>{nodeInfo.anchorPath.join(' > ')}</td>
                    </tr>
                ) : null}

                {nodeInfo.anchorArgs ? (
                    <tr>
                        <td>
                            <strong>ANCHOR ARGS</strong>
                        </td>
                        <td>{nodeInfo.anchorArgs}</td>
                    </tr>
                ) : null}

                {nodeInfo.nDescendants ? (
                    <tr>
                        <td>
                            <strong>#DESCENDANTS</strong>
                        </td>
                        <td>{nodeInfo.nDescendants}</td>
                    </tr>
                ) : null}

                {nodeInfo.nHided ? (
                    <tr>
                        <td>
                            <strong>#HIDDEN</strong>
                        </td>
                        <td>{`[${nodeInfo.hiddenNodes.map((node) => ' ' + node)} ]`}</td>
                    </tr>
                ) : null}
                {nodeInfo.dependencies.length ? (
                    <tr>
                        <td>
                            <strong>DEPENDENCIES</strong>
                        </td>
                        <td>{`${nodeInfo.dependencies.map(
                            (dependency) => ` ${dependency.piId}: [${dependency.depsId.map((dep) => ' ' + dep)} ] `,
                        )}`}</td>
                    </tr>
                ) : null}
            </tbody>
        </table>
    );
};

export default NodeInfoTable;
