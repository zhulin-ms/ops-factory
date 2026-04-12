import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type { GraphData, GraphNode } from '../../../../types/host'

const CLUSTER_TYPE_COLORS: Record<string, string> = {
    NSLB: '#5470c6',
    RCPA: '#91cc75',
    RCPADB: '#fac858',
    KAFKA: '#ee6666',
    GWDB: '#73c0de',
    GMDB: '#73c0de',
    MEMDB: '#3ba272',
}
const DEFAULT_COLOR = '#9a60b4'

type Props = {
    data: GraphData
    focusedHostId?: string | null
    hopFocusId?: string | null
    onNodeClick?: (nodeId: string) => void
    onNodeDoubleClick?: (nodeId: string) => void
    onBackgroundClick?: () => void
}

function FullscreenIcon() {
    return (
        <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
            <path d="M3 3h4v1.5H4.5V7H3V3zm10 0h4v4h-1.5V4.5H13V3zM3 13h1.5v2.5H7V17H3v-4zm13 0v4h-4v-1.5h2.5V13H16z"/>
        </svg>
    )
}

function ExitFullscreenIcon() {
    return (
        <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
            <path d="M5.5 3H7v4H3V5.5h1.5V3H5.5zm9 0H13v1.5h1.5V6H16V3h-1.5zM3 13h4v4H5.5v-1.5H4V14H3v-1zm10 4h1.5v-1.5H16V14h-1.5v1.5H13V17zm-2-4H9v-2H7V9h2V7h2v2h2v2h-2v2z"/>
        </svg>
    )
}

/**
 * Compute topological layer positions: ingoing=0 nodes at the top,
 * then expand layer by layer via outgoing edges.
 * Uses fixed spacing so the graph stays compact regardless of container size.
 * First row is top-aligned (moved up) to maximize vertical space for 3 rows.
 */
const FIXED_NODE_GAP_X = 120   // horizontal px between sibling nodes
const FIXED_LAYER_GAP_Y = 90   // vertical px between layers (compact for 3 rows)
const PAD_TOP = 30             // top padding — first row starts here

function computeLayerPositions(
    nodeIds: string[],
    edges: { source: string; target: string }[],
    width: number,
    _height: number,
): Map<string, { x: number; y: number }> {
    const nodeSet = new Set(nodeIds)

    // Build adjacency: count incoming edges within the visible set
    const inCount = new Map<string, number>()
    const outTargets = new Map<string, string[]>()
    for (const id of nodeIds) {
        inCount.set(id, 0)
        outTargets.set(id, [])
    }
    for (const e of edges) {
        if (nodeSet.has(e.source) && nodeSet.has(e.target)) {
            inCount.set(e.target, (inCount.get(e.target) ?? 0) + 1)
            outTargets.get(e.source)!.push(e.target)
        }
    }

    // BFS layering: start from nodes with no incoming edges
    const layers: string[][] = []
    const assigned = new Set<string>()

    // Seed: ingoing=0 nodes
    const seed = nodeIds.filter(id => (inCount.get(id) ?? 0) === 0)
    if (seed.length > 0) {
        layers.push(seed)
        seed.forEach(id => assigned.add(id))
    } else {
        // No root nodes (cycle) — put first node as layer 0
        layers.push([nodeIds[0]])
        assigned.add(nodeIds[0])
    }

    // BFS expand
    let frontier = layers[0]
    while (assigned.size < nodeIds.length) {
        const next: string[] = []
        for (const src of frontier) {
            for (const tgt of (outTargets.get(src) ?? [])) {
                if (!assigned.has(tgt)) {
                    next.push(tgt)
                    assigned.add(tgt)
                }
            }
        }
        if (next.length === 0) {
            // Remaining unassigned nodes (disconnected) — add as one layer
            const remaining = nodeIds.filter(id => !assigned.has(id))
            if (remaining.length > 0) layers.push(remaining)
            break
        }
        layers.push(next)
        frontier = next
    }

    // Position: top-aligned, fixed spacing, no scaling
    const result = new Map<string, { x: number; y: number }>()
    const cx = width / 2
    const layerCount = layers.length

    const startY = PAD_TOP

    for (let li = 0; li < layerCount; li++) {
        const layer = layers[li]
        const y = startY + FIXED_LAYER_GAP_Y * li
        const layerWidth = (layer.length - 1) * FIXED_NODE_GAP_X
        const startX = cx - layerWidth / 2
        for (let ni = 0; ni < layer.length; ni++) {
            result.set(layer[ni], {
                x: startX + FIXED_NODE_GAP_X * ni,
                y,
            })
        }
    }
    return result
}

export default function RelationGraph({ data, focusedHostId, hopFocusId, onNodeClick, onNodeDoubleClick, onBackgroundClick }: Props) {
    const [fullscreen, setFullscreen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const [dims, setDims] = useState({ w: 800, h: 300 })

    const handleFullscreen = useCallback(() => {
        setFullscreen(prev => !prev)
    }, [])

    // +1 hop filtering: show the hopFocusId node and all its direct neighbors (outgoing + incoming)
    const displayData = useMemo(() => {
        if (!hopFocusId) return data

        const neighborIds = new Set<string>([hopFocusId])
        const connectedEdges = data.edges.filter(e => {
            if (e.source === hopFocusId || e.target === hopFocusId) {
                neighborIds.add(e.source)
                neighborIds.add(e.target)
                return true
            }
            return false
        })

        return { nodes: data.nodes.filter(n => neighborIds.has(n.id)), edges: connectedEdges }
    }, [data, hopFocusId])

    const positionedOption = useMemo<EChartsOption>(() => {
        const nodeCount = displayData.nodes.length
        if (nodeCount === 0) return { series: [] }

        const nodeIdList = displayData.nodes.map(n => n.id)
        const positions = computeLayerPositions(nodeIdList, displayData.edges, dims.w, dims.h)

        // BFS to find all downstream nodes & edges reachable via outgoing traversal from focusedHostId
        const downstreamNodes = new Set<string>()
        const downstreamEdges = new Set<number>()
        if (focusedHostId) {
            const outMap = new Map<string, number[]>()
            displayData.edges.forEach((e, i) => {
                if (!outMap.has(e.source)) outMap.set(e.source, [])
                outMap.get(e.source)!.push(i)
            })
            const queue = [focusedHostId]
            downstreamNodes.add(focusedHostId)
            while (queue.length > 0) {
                const cur = queue.shift()!
                for (const idx of (outMap.get(cur) ?? [])) {
                    downstreamEdges.add(idx)
                    const tgt = displayData.edges[idx].target
                    if (!downstreamNodes.has(tgt)) {
                        downstreamNodes.add(tgt)
                        queue.push(tgt)
                    }
                }
            }
        }

        const highlightId = focusedHostId ?? hopFocusId
        const nodes = displayData.nodes.map((n) => {
            const pos = positions.get(n.id) ?? { x: dims.w / 2, y: dims.h / 2 }
            const isDownstream = focusedHostId ? downstreamNodes.has(n.id) : n.id === highlightId
            const isSource = n.id === focusedHostId
            return {
            id: n.id,
            name: n.name,
            x: pos.x,
            y: pos.y,
            symbolSize: isSource ? 46 : isDownstream ? 38 : 32,
            fixed: false,
            itemStyle: {
                color: CLUSTER_TYPE_COLORS[(n.clusterType ?? '').toUpperCase()] || DEFAULT_COLOR,
                borderColor: isDownstream ? '#1e293b' : undefined,
                borderWidth: isDownstream ? 2 : 0,
                opacity: focusedHostId && !isDownstream ? 0.4 : 1,
            },
            label: {
                show: true,
                fontSize: isSource ? 12 : isDownstream ? 11 : 10,
                position: 'bottom' as const,
            },
            tooltip: {
                formatter: () => {
                    const parts = [`<b>${n.name}</b>`, `IP: ${n.ip}`]
                    if (n.clusterType) parts.push(`Type: ${n.clusterType}`)
                    if (n.clusterName) parts.push(`Cluster: ${n.clusterName}`)
                    if (n.purpose) parts.push(`Purpose: ${n.purpose}`)
                    return parts.join('<br/>')
                },
            },
        }})

        const edges = displayData.edges.map((e, i) => {
            const isDownstream = downstreamEdges.has(i)
            return {
                source: e.source,
                target: e.target,
                lineStyle: {
                    curveness: 0.15,
                    ...(focusedHostId ? {
                        width: isDownstream ? 3 : 1,
                        color: isDownstream ? '#5470c6' : '#d0d5dd',
                        opacity: isDownstream ? 1 : 0.4,
                        type: isDownstream ? 'dashed' as const : 'solid' as const,
                    } : {}),
                },
                label: { show: !focusedHostId || isDownstream, formatter: e.description || '', fontSize: 10 },
                symbol: ['none', 'arrow'] as [string, string],
                symbolSize: [4, 8],
            }
        })

        return {
            tooltip: {},
            animation: false,
            series: [{
                type: 'graph',
                layout: 'none',
                roam: true,
                draggable: true,
                label: {
                    position: 'bottom',
                    fontSize: 11,
                },
                data: nodes,
                links: edges,
                ...(!focusedHostId ? {
                    emphasis: {
                        focus: 'adjacency',
                        lineStyle: { width: 3 },
                    },
                } : {}),
            }],
        } as EChartsOption
    }, [displayData, focusedHostId, hopFocusId, dims])

    const handleEvents = useMemo(() => ({
        click: (params: { dataType?: string; data?: GraphNode; componentType?: string }) => {
            if (params.componentType === 'series' && params.dataType === 'node' && params.data?.id && onNodeClick) {
                onNodeClick(params.data.id)
            } else if (params.componentType !== 'series' && onBackgroundClick) {
                onBackgroundClick()
            }
        },
        dblclick: (params: { dataType?: string; data?: GraphNode; componentType?: string }) => {
            if (params.componentType === 'series' && params.dataType === 'node' && params.data?.id && onNodeDoubleClick) {
                onNodeDoubleClick(params.data.id)
            }
        },
    }), [onNodeClick, onNodeDoubleClick, onBackgroundClick])

    // Track container size via ResizeObserver to avoid infinite re-renders
    const setContainerRef = useCallback((el: HTMLDivElement | null) => {
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
    }, [])

    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect
                const w = width || 800
                const h = height || 300
                setDims(prev => {
                    if (prev.w === w && prev.h === h) return prev
                    return { w, h }
                })
            }
        })
        observer.observe(el)
        return () => observer.disconnect()
    }, [fullscreen, data.nodes.length])

    if (data.nodes.length === 0) {
        return <div className="hr-graph-empty">No topology data available</div>
    }

    const chart = (
        <ReactECharts
            option={positionedOption}
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'svg' }}
            notMerge
            lazyUpdate
            onEvents={handleEvents}
            className={focusedHostId ? 'hr-graph-focused' : ''}
        />
    )

    if (fullscreen) {
        return (
            <div
                ref={setContainerRef}
                className="hr-topology-fullscreen"
            >
                <button className="hr-topology-fullscreen-btn" onClick={handleFullscreen} title="Exit fullscreen">
                    <ExitFullscreenIcon />
                </button>
                {chart}
            </div>
        )
    }

    return (
        <div
            ref={setContainerRef}
            style={{ position: 'relative', width: '100%', height: '100%' }}
        >
            <button className="hr-topology-fullscreen-btn" onClick={handleFullscreen} title="Fullscreen">
                <FullscreenIcon />
            </button>
            {chart}
        </div>
    )
}
