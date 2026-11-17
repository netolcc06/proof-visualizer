import type { JSX } from 'react';
import React from 'react';
import '../../interfaces/interfaces';
import { NodeInterface, ProofState } from '../../interfaces/interfaces';
import { HIGHLIGHT_COLOR } from '../../interfaces/clusterStyle';
import { textColorFromBg, sixDigitColor, piLabel } from '../VisualizerStage/Canvas/VisualizerNode';
import { Rect, selectExportItems, visibleGraphBounds } from '../VisualizerStage/Canvas/exportGeometry';

interface Point {
    x: number;
    y: number;
}

interface ArrowProps {
    origin: Point;
    end: Point;
}

const arrowTriangleH = 15;
const arrowTriangleW = 5;
const fontSize = 15;
const fontFamily = 'Arial';

const Arrow: React.FC<ArrowProps> = ({ origin, end }: ArrowProps) => {
    const h = origin.y - end.y;
    const w = end.x - origin.x;
    const l = Math.sqrt(h ** 2 + w ** 2);

    const sin = h / l;
    const cos = w / l;

    const axeX = end.x - arrowTriangleH * cos;
    const axeY = end.y + arrowTriangleH * sin;

    const alpha = Math.atan2(h, w) + Math.PI / 2;
    const sin1 = Math.sin(alpha);
    const cos1 = Math.cos(alpha);

    const p1X = axeX - arrowTriangleW * cos1;
    const p1Y = axeY + arrowTriangleW * sin1;

    const p2X = axeX + arrowTriangleW * cos1;
    const p2Y = axeY - arrowTriangleW * sin1;

    return (
        <>
            <path d={`M${end.x} ${end.y} L${p1X} ${p1Y} L${p2X} ${p2Y} Z`} />
            <line x1={origin.x} y1={origin.y} x2={end.x} y2={end.y} strokeWidth="1" stroke="black" />
        </>
    );
};

function CreateNode(node: NodeInterface, visualInfo: ProofState['visualInfo'], limits: [number, number]): JSX.Element {
    const { color, x, y, highlighted } = visualInfo[node.id];
    const stroke = highlighted ? HIGHLIGHT_COLOR : 'black';
    const strokeWidth = highlighted ? 3 : 1;
    const [smallestX, smallestY] = limits;
    const newX = x - smallestX;
    const newY = y - smallestY;

    const fill = textColorFromBg(sixDigitColor(color));

    const nHided = node.hiddenNodes ? node.hiddenNodes.length : 0;
    const infos = {
        nHided: nHided ? `#hidden: ${nHided}` : '',
        nDescendants: ` #descendants: ${node.descendants - 1}`,
        rule: nHided ? piLabel(node.clusterType) : node.rule,
        dependencies: node.dependencies.length === 1 ? String(node.dependencies[0].piId) : 'π',
    };

    return (
        <>
            <rect
                x={newX + 0}
                y={newY + 0}
                width={300}
                height={35}
                strokeWidth={strokeWidth}
                fill={color}
                stroke={stroke}
            />
            <rect
                x={newX + 0}
                y={newY + 35}
                width={300}
                height={35}
                strokeWidth={strokeWidth}
                fill={color}
                stroke={stroke}
            />
            <rect
                x={newX + 0}
                y={newY + 70}
                width={50}
                height={35}
                strokeWidth={strokeWidth}
                fill={color}
                stroke={stroke}
            />
            <rect
                x={newX + 50}
                y={newY + 70}
                width={250}
                height={35}
                strokeWidth={strokeWidth}
                fill={color}
                stroke={stroke}
            />
            <defs>
                <clipPath id={'clip-conc-' + node.id}>
                    <rect x={newX} y={newY} width={300} height={35} />
                </clipPath>
                <clipPath id={'clip-rule-' + node.id}>
                    <rect x={newX} y={newY + 35} width={300} height={35} />
                </clipPath>
                <clipPath id={'clip-id-' + node.id}>
                    <rect x={newX} y={newY + 70} width={50} height={35} />
                </clipPath>
                <clipPath id={'clip-hidden-' + node.id}>
                    <rect x={newX + 50} y={newY + 70} width={250} height={35} />
                </clipPath>
            </defs>

            {node.stepId && !nHided ? (
                <text x={newX + 2} y={newY - 4} fontSize={11} fill="#8a8a8a" fontFamily={fontFamily}>
                    {node.stepId}
                </text>
            ) : null}
            <text
                x={newX + 150}
                y={newY + 21}
                fontSize={fontSize}
                fill={fill}
                dominantBaseline="middle"
                textAnchor="middle"
                fontFamily={fontFamily}
                clipPath={`url(#clip-conc-${node.id})`}
            >
                {node.conclusion}
            </text>
            <text
                x={newX + 150}
                y={newY + 56}
                fontSize={fontSize}
                fill={fill}
                dominantBaseline="middle"
                textAnchor="middle"
                fontFamily={fontFamily}
                clipPath={`url(#clip-rule-${node.id})`}
            >
                {infos.rule}
            </text>
            <text
                x={newX + 25}
                y={newY + 91}
                fontSize={fontSize}
                fill={fill}
                dominantBaseline="middle"
                textAnchor="middle"
                fontFamily={fontFamily}
                clipPath={`url(#clip-id-${node.id})`}
            >
                {node.id.toString()}
            </text>
            <text
                x={newX + 175}
                y={newY + 91}
                fontSize={fontSize}
                fill={fill}
                dominantBaseline="middle"
                textAnchor="middle"
                fontFamily={fontFamily}
                clipPath={`url(#clip-hidden-${node.id})`}
            >
                {infos.nHided + infos.nDescendants}
            </text>
            {node.dependencies.length ? (
                <>
                    <circle
                        cx={newX + 350}
                        cy={newY + 53}
                        r={25}
                        strokeWidth={strokeWidth}
                        fill={color}
                        stroke={stroke}
                    />
                    <Arrow origin={{ x: newX + 325, y: newY + 53 }} end={{ x: newX + 300, y: newY + 53 }} />
                    <text
                        x={newX + 350}
                        y={newY + 53}
                        fontSize={fontSize}
                        fill={fill}
                        dominantBaseline="middle"
                        textAnchor="middle"
                        fontFamily={fontFamily}
                    >
                        {infos.dependencies}
                    </text>
                </>
            ) : null}
        </>
    );
}

// Without `region` the whole visible graph is drawn; with one, the SVG covers that graph region only
export function ConvertToSVG(proof: NodeInterface[], visualInfo: ProofState['visualInfo'], region?: Rect): JSX.Element {
    const bounds = region ?? visibleGraphBounds(proof, visualInfo) ?? { x: 0, y: 0, width: 1, height: 1 };
    const limits: [number, number] = [bounds.x, bounds.y];
    const { nodes, edges } = selectExportItems(proof, visualInfo, region);
    const width = Math.ceil(bounds.width);
    const height = Math.ceil(bounds.height);

    return (
        <svg
            id="svg-converted"
            xmlns="http://www.w3.org/2000/svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
        >
            {edges.map(({ from, to }) => (
                <Arrow
                    key={`${from}->${to}`}
                    origin={{ x: visualInfo[from].x - limits[0] + 150, y: visualInfo[from].y - limits[1] }}
                    end={{ x: visualInfo[to].x - limits[0] + 150, y: visualInfo[to].y - limits[1] + 105 }}
                />
            ))}
            {nodes.map((node) => (
                <React.Fragment key={node.id}>{CreateNode(node, visualInfo, limits)}</React.Fragment>
            ))}
        </svg>
    );
}
