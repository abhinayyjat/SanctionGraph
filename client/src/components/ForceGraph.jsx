/**
 * client/src/components/ForceGraph.jsx — Week 4
 *
 * LEARNING — D3 + React integration pattern:
 *
 * The core conflict: both React and D3 want to own the DOM.
 * React uses a virtual DOM and reconciles changes.
 * D3 directly mutates real DOM nodes (element.attr(), element.style()).
 *
 * The solution: React renders ONE <svg> element and hands it to D3 via useRef.
 * D3 owns everything INSIDE the SVG. React never touches SVG children.
 *
 * useRef holds the SVG DOM node across renders without triggering re-renders.
 * useEffect runs AFTER React renders the SVG — then D3 takes over.
 *
 * Force simulation physics:
 *   forceManyBody → nodes repel each other (negative strength = repulsion)
 *   forceLink     → edges act as springs pulling nodes together
 *   forceCenter   → pulls all nodes toward a central point
 *   forceCollide  → nodes cannot overlap (treated as circles)
 *
 * On each "tick" (animation frame), D3 updates x/y on every node,
 * then we move SVG elements to those coordinates.
 */

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

const RISK_COLOR = (score) => {
  if (score >= 100) return '#e53e3e'
  if (score >= 70)  return '#dd6b20'
  if (score >= 30)  return '#d69e2e'
  return '#38a169'
}

const RISK_STROKE = (score) => {
  if (score >= 100) return '#9b2c2c'
  if (score >= 70)  return '#9c4221'
  if (score >= 30)  return '#975a16'
  return '#276749'
}

export default function ForceGraph({ graphData, onNodeClick, selectedNodeId }) {
  const svgRef = useRef(null)

  useEffect(() => {
    if (!graphData || !svgRef.current) return

    // ── 1. Clone data (D3 mutates nodes by adding x, y, vx, vy) ─────────────
    // nx.node_link_data() puts attributes flat on each node (no nested
    // "data" key) — spread the whole node, don't reach into n.data.
    const nodes = graphData.nodes.map(n => ({ ...n }))
    const links = graphData.links.map(l => ({
      source: l.source, target: l.target,
      relationship: l.relationship, share_pct: l.share_pct,
    }))

    // ── 2. Set up SVG canvas ─────────────────────────────────────────────────
    const container = svgRef.current
    const width  = container.clientWidth  || 900
    const height = container.clientHeight || 600

    // Clear previous render (useEffect re-runs when graphData changes)
    const svg = d3.select(container)
    svg.selectAll('*').remove()

    // ── 3. Zoom + pan ────────────────────────────────────────────────────────
    // LEARNING: d3.zoom() adds scroll-to-zoom and drag-to-pan behavior.
    // We apply transforms to a <g> wrapper so all elements move together.
    const g    = svg.append('g')
    const zoom = d3.zoom()
      .scaleExtent([0.1, 8])
      .on('zoom', e => g.attr('transform', e.transform))
    svg.call(zoom)

    // Double-click to reset zoom
    svg.on('dblclick.zoom', () =>
      svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity)
    )

    // ── 4. Arrow marker ──────────────────────────────────────────────────────
    svg.append('defs').append('marker')
      .attr('id', 'arr').attr('viewBox', '0 -5 10 10')
      .attr('refX', 24).attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#4a5568')

    // ── 5. Draw edges ────────────────────────────────────────────────────────
    const link = g.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', '#2d3748')
      .attr('stroke-width', d => d.relationship === 'shareholder' ? 2 : 1)
      .attr('stroke-dasharray', d => d.relationship === 'officer' ? '4,3' : null)
      .attr('marker-end', 'url(#arr)')

    // ── 6. Draw nodes ────────────────────────────────────────────────────────
    const nodeG = g.append('g').selectAll('g').data(nodes).join('g')
      .attr('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation()
        onNodeClick && onNodeClick(d)
      })

    // Selection ring (shows which node is selected)
    nodeG.append('circle')
      .attr('r', d => (d.depth === 0 ? 22 : 16) + 6)
      .attr('fill', 'none')
      .attr('stroke', d => d.id === selectedNodeId ? '#58a6ff' : 'none')
      .attr('stroke-width', 2)

    // Sanctioned entity pulsing ring
    nodeG.filter(d => d.sanctioned).append('circle')
      .attr('r', d => (d.depth === 0 ? 22 : 16) + 4)
      .attr('fill', 'none')
      .attr('stroke', '#e53e3e')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,2')

    // Main circle
    nodeG.append('circle')
      .attr('r', d => d.depth === 0 ? 22 : 16)
      .attr('fill', d => RISK_COLOR(d.risk_score || 0))
      .attr('stroke', d => RISK_STROKE(d.risk_score || 0))
      .attr('stroke-width', d => d.sanctioned ? 3 : 1.5)

    // Risk score text
    nodeG.append('text')
      .text(d => d.risk_score || 0)
      .attr('text-anchor', 'middle').attr('dy', '0.35em')
      .attr('fill', 'white').attr('font-size', 10)
      .attr('font-weight', 'bold').attr('font-family', 'IBM Plex Mono, monospace')
      .attr('pointer-events', 'none')

    // Entity name label (below circle)
    nodeG.append('text')
      .text(d => {
        const w = (d.name || '').split(' ')
        return w.slice(0, 2).join(' ') + (w.length > 2 ? '…' : '')
      })
      .attr('text-anchor', 'middle')
      .attr('dy', d => (d.depth === 0 ? 22 : 16) + 14)
      .attr('fill', '#8b949e').attr('font-size', 10)
      .attr('font-family', 'IBM Plex Sans, sans-serif')
      .attr('pointer-events', 'none')

    // Jurisdiction badge
    nodeG.filter(d => d.jurisdiction).append('text')
      .text(d => d.jurisdiction)
      .attr('text-anchor', 'middle')
      .attr('dy', d => (d.depth === 0 ? 22 : 16) + 24)
      .attr('fill', '#4a5568').attr('font-size', 9)
      .attr('pointer-events', 'none')

    // ── 7. Drag behavior ─────────────────────────────────────────────────────
    // LEARNING: d.fx/d.fy = "fixed" position. Setting them locks the node in place.
    // Setting to null releases it back to the simulation.
    nodeG.call(d3.drag()
      .on('start', (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart()
        d.fx = d.x; d.fy = d.y
      })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
      .on('end', (event, d) => {
        if (!event.active) sim.alphaTarget(0)
        d.fx = null; d.fy = null
      })
    )

    // ── 8. Force simulation ──────────────────────────────────────────────────
    const sim = d3.forceSimulation(nodes)
      .force('link',    d3.forceLink(links).id(d => d.id).distance(120).strength(0.4))
      .force('charge',  d3.forceManyBody().strength(-400))
      .force('center',  d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(35))
      .on('tick', () => {
        link
          .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
        nodeG.attr('transform', d => `translate(${d.x},${d.y})`)
      })

    // Click on background → deselect node
    svg.on('click', () => onNodeClick && onNodeClick(null))

    // Cleanup: stop simulation when component unmounts or graphData changes
    return () => sim.stop()

  }, [graphData, selectedNodeId])

  return (
    <svg
      ref={svgRef}
      style={{ width: '100%', height: '100%', minHeight: 500, display: 'block' }}
    >
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </svg>
  )
}