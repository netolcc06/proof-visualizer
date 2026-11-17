import { ClusterKind } from './enum';

export interface ClusterStyle {
    label: string;
    color: string;
}

// Single source of truth for the component colors and labels (mid tones: readable in both themes)
export const CLUSTER_STYLE: { [kind in ClusterKind]: ClusterStyle } = {
    [ClusterKind.NONE]: { label: 'Other', color: '#ffffff' },
    [ClusterKind.SAT]: { label: 'SAT refutation', color: '#b07cc6' },
    [ClusterKind.CNF]: { label: 'Clausification (CNF)', color: '#f2c14e' },
    [ClusterKind.TL]: { label: 'Theory lemmas', color: '#6bb36b' },
    [ClusterKind.PP]: { label: 'Preprocessing', color: '#c49a7c' },
    [ClusterKind.IN]: { label: 'Input', color: '#5fa8e0' },
    [ClusterKind.RW]: { label: 'Rewriting', color: '#e58fb0' },
};

// Components shown in legends, in pipeline order
export const CLUSTER_KINDS: ClusterKind[] = [
    ClusterKind.SAT,
    ClusterKind.CNF,
    ClusterKind.TL,
    ClusterKind.RW,
    ClusterKind.PP,
    ClusterKind.IN,
];

export const clusterLabel = (kind: ClusterKind): string => CLUSTER_STYLE[kind]?.label ?? '';

// Border of the nodes marked as highlighted (e.g. steps added by a spliced slice)
export const HIGHLIGHT_COLOR = '#3dccc7';
