import React from 'react';
import { useAppSelector } from '../../store/hooks';
import { selectComponentCounts } from '../../store/features/proof/proofSlice';
import { CLUSTER_KINDS, CLUSTER_STYLE } from '../../interfaces/clusterStyle';
import { ClusterKind } from '../../interfaces/enum';

interface ComponentLegendProps {
    // Makes the entries clickable
    onSelect?: (kind: ClusterKind) => void;
    // Floating panel over the canvas instead of an inline list
    floating?: boolean;
}

// Components present in the proof, with their color and number of nodes
const ComponentLegend: React.FC<ComponentLegendProps> = ({ onSelect, floating }: ComponentLegendProps) => {
    const counts = useAppSelector(selectComponentCounts);
    const present = CLUSTER_KINDS.filter((kind) => counts[kind]);
    if (!present.length) return null;

    return (
        <ul className={`component-legend${floating ? ' floating' : ''}`}>
            {present.map((kind) => (
                <li
                    key={kind}
                    className={onSelect ? 'clickable' : undefined}
                    onClick={onSelect ? () => onSelect(kind) : undefined}
                >
                    <span className="swatch" style={{ background: CLUSTER_STYLE[kind].color }} />
                    <span className="label">{CLUSTER_STYLE[kind].label}</span>
                    <span className="count">{counts[kind]}</span>
                </li>
            ))}
        </ul>
    );
};

export default ComponentLegend;
