import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useDeckStore } from '@/store/deckStore'
import { getDeckCorners } from '@/utils/geometry'
import { getBoardLinesForShape, getEdgeDims } from '@/utils/polygon'
import {
  numSteps, getStairCorners, getPlanterCorners,
  STEP_RISE, STEP_DEPTH,
} from '@/utils/stairPlanter'
import {
  JOIST_W, JOIST_H, BEAM_W, BEAM_H, POST_W, FOOTING_W, FOOTING_H,
  MAX_CANTILEVER,
  getJoistXPositions, getPostXPositions, getBeamYPositions, beamXExtent, joistYExtent,
} from '@/utils/structure'
import type { DeckShape, WallDirection, Stair, PlanterBox } from '@/types/deck'

const DIR_ANGLE: Record<WallDirection, number> = {
  south: 0,
  west:  Math.PI / 2,
  north: Math.PI,
  east:  -Math.PI / 2,
}

const LAYERS = [
  { level: 1 as const, label: 'Plintar' },
  { level: 2 as const, label: 'Balkar' },
  { level: 3 as const, label: 'Reglar' },
  { level: 4 as const, label: 'Trall' },
]

function buildDeckGeometry(shape: DeckShape, height: number): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(shape[0].x, -shape[0].y)
  for (let i = 1; i < shape.length; i++) s.lineTo(shape[i].x, -shape[i].y)
  s.closePath()

  const geo = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2)
  return geo
}

function addStairs(
  group: THREE.Group,
  stairs: Stair[],
  shape: DeckShape,
  heightAboveGround: number,
) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xc8a46e })
  const edges = getEdgeDims(shape)
  const steps = numSteps(heightAboveGround)

  for (const stair of stairs) {
    if (stair.kind === 'corner') {
      const n = shape.length
      const anchor = shape[stair.cornerIndex]
      if (!anchor) continue
      const nA = edges[(stair.cornerIndex - 1 + n) % n].outNormal
      const nB = edges[stair.cornerIndex].outNormal
      const rotY = Math.atan2(-nA.y, nA.x)

      for (let s = 0; s < steps; s++) {
        const size = (s + 1) * STEP_DEPTH
        const slabH = Math.max(0.01, heightAboveGround - (s + 1) * STEP_RISE)
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, slabH, size), mat)
        mesh.rotation.y = rotY
        mesh.position.set(
          anchor.x + (size / 2) * nA.x + (size / 2) * nB.x,
          slabH / 2,
          anchor.y + (size / 2) * nA.y + (size / 2) * nB.y,
        )
        group.add(mesh)
      }
    } else {
      const edge = edges[stair.edgeIndex]
      if (!edge) continue
      const corners = getStairCorners(edge, stair, steps)
      const cx = (corners[0].x + corners[1].x) / 2
      const cz = (corners[0].y + corners[1].y) / 2
      const nx = edge.outNormal.x
      const nz = edge.outNormal.y
      const tx = edge.to.x - edge.from.x
      const tz = edge.to.y - edge.from.y
      const tLen = Math.sqrt(tx * tx + tz * tz)
      const rotY = tLen > 0 ? -Math.atan2(tz / tLen, tx / tLen) : 0

      for (let s = 0; s < steps; s++) {
        const distFromEdge = (s + 0.5) * STEP_DEPTH
        const slabH = Math.max(0.01, heightAboveGround - (s + 1) * STEP_RISE)
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(stair.width, slabH, STEP_DEPTH), mat)
        mesh.rotation.y = rotY
        mesh.position.set(cx + nx * distFromEdge, slabH / 2, cz + nz * distFromEdge)
        group.add(mesh)
      }
    }
  }
}

function addPlanters(
  group: THREE.Group,
  planters: PlanterBox[],
  shape: DeckShape,
  heightAboveGround: number,
) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x7a5c1e })
  const edges = getEdgeDims(shape)

  for (const pl of planters) {
    const edge = edges[pl.edgeIndex]
    if (!edge) continue

    const corners = getPlanterCorners(edge, pl)
    const innerCx = (corners[0].x + corners[1].x) / 2
    const innerCz = (corners[0].y + corners[1].y) / 2
    const cx = innerCx + (pl.boxDepth / 2) * edge.outNormal.x
    const cz = innerCz + (pl.boxDepth / 2) * edge.outNormal.y

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(pl.width, heightAboveGround, pl.boxDepth), mat)
    const tx = edge.to.x - edge.from.x
    const tz = edge.to.y - edge.from.y
    const tLen = Math.sqrt(tx * tx + tz * tz)
    if (tLen > 0) mesh.rotation.y = -Math.atan2(tz / tLen, tx / tLen)
    mesh.position.set(cx, heightAboveGround / 2, cz)
    group.add(mesh)
  }
}

function addStructureLayers(
  group: THREE.Group,
  shape: DeckShape,
  heightAboveGround: number,
  maxLayer: 1 | 2 | 3,
) {
  const woodMat     = new THREE.MeshLambertMaterial({ color: 0x8b6530 })
  const concreteMat = new THREE.MeshLambertMaterial({ color: 0xaaaaaa })

  const xs = shape.map(p => p.x)
  const ys = shape.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)

  const beamCenterY  = heightAboveGround - JOIST_H - BEAM_H / 2
  const joistCenterY = heightAboveGround - JOIST_H / 2
  const postH        = Math.max(0.01, heightAboveGround - JOIST_H - BEAM_H - FOOTING_H)

  const beamYs = getBeamYPositions(minY, maxY, shape)

  // --- Layer 1: footings + posts under every non-ledger beam ---
  for (let bi = 1; bi < beamYs.length; bi++) {
    const by = beamYs[bi]
    const ext = beamXExtent(shape, by, minY, maxY, minX, maxX)
    for (const px of getPostXPositions(ext.minX, ext.maxX)) {
      const footing = new THREE.Mesh(
        new THREE.BoxGeometry(FOOTING_W, FOOTING_H, FOOTING_W),
        concreteMat,
      )
      footing.position.set(px, FOOTING_H / 2, by)
      group.add(footing)

      if (postH > 0) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(POST_W, postH, POST_W), woodMat)
        post.position.set(px, FOOTING_H + postH / 2, by)
        group.add(post)
      }
    }
  }

  if (maxLayer < 2) return

  // --- Layer 2: all beams clipped to shape ---
  for (let bi = 0; bi < beamYs.length; bi++) {
    const by = beamYs[bi]
    const ext = beamXExtent(shape, by, minY, maxY, minX, maxX)
    const bw = ext.maxX - ext.minX
    const bMidX = (ext.minX + ext.maxX) / 2
    const bz = bi === 0 ? minY + BEAM_W / 2 : by
    const beam = new THREE.Mesh(new THREE.BoxGeometry(bw, BEAM_H, BEAM_W), woodMat)
    beam.position.set(bMidX, beamCenterY, bz)
    group.add(beam)
  }

  if (maxLayer < 3) return

  // --- Layer 3: joists clipped to shape and beam supports at c/c 600 mm ---
  const ε = 0.001
  for (const jx of getJoistXPositions(minX, maxX)) {
    const ext = joistYExtent(shape, jx, minX, maxX)
    if (!ext) continue

    let outerBeamY = ext.minY
    for (let bi = beamYs.length - 1; bi >= 0; bi--) {
      const by = beamYs[bi]
      if (by > ext.maxY + ε) continue
      const bext = beamXExtent(shape, by, minY, maxY, minX, maxX)
      if (bext.minX <= jx + ε && bext.maxX >= jx - ε) { outerBeamY = by; break }
    }

    const jMaxY = Math.min(ext.maxY, outerBeamY + MAX_CANTILEVER)
    if (jMaxY <= ext.minY + ε) continue

    const jLen = jMaxY - ext.minY
    const joist = new THREE.Mesh(
      new THREE.BoxGeometry(JOIST_W, JOIST_H, jLen),
      woodMat,
    )
    joist.position.set(jx, joistCenterY, (ext.minY + jMaxY) / 2)
    group.add(joist)
  }
}

// Dispose all geometry in a group without removing lights or permanent scene objects
function clearGroup(group: THREE.Group) {
  while (group.children.length) {
    const child = group.children[0]
    group.remove(child)
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose()
    }
  }
}

export default function PerspectiveView() {
  const containerRef = useRef<HTMLDivElement>(null)

  const {
    wallLength, wallDirection, deckWidth, deckDepth,
    heightAboveGround, boardDirection, customShape,
    stairs, planters, viewLayer, setViewLayer,
  } = useDeckStore()

  // Compute initial camera framing synchronously (captured once before any effect)
  const initRef = useRef<{ sceneSize: number; midZ: number; initHeight: number } | null>(null)
  if (!initRef.current) {
    const s = customShape ?? getDeckCorners({ wallLength, wallDirection, deckWidth, deckDepth, heightAboveGround, boardDirection })
    const ixs = s.map(p => p.x), iys = s.map(p => p.y)
    const spanX = Math.max(...ixs) - Math.min(...ixs)
    const spanZ = Math.max(...iys) - Math.min(...iys)
    initRef.current = {
      sceneSize: Math.max(wallLength, spanX, spanZ),
      midZ: spanZ / 2,
      initHeight: heightAboveGround,
    }
  }

  // Refs for persistent Three.js objects (survive content re-renders)
  const sceneRef    = useRef<THREE.Scene | null>(null)
  const groupRef    = useRef<THREE.Group | null>(null)
  const cameraRef   = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const animIdRef   = useRef<number>(0)

  // ── Effect 1: setup renderer / camera / controls (runs once on mount) ─────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const W = container.clientWidth
    const H = container.clientHeight
    const { sceneSize, midZ, initHeight } = initRef.current!

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xeef2ee)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 200)
    camera.position.set(sceneSize * 1.0, sceneSize * 0.9, sceneSize * 1.5)
    camera.lookAt(0, initHeight / 2, midZ)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(W, H)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, initHeight / 2, midZ)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controlsRef.current = controls

    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const sun = new THREE.DirectionalLight(0xffffff, 0.9)
    sun.position.set(5, 10, 8)
    scene.add(sun)

    const group = new THREE.Group()
    scene.add(group)
    groupRef.current = group

    const animate = () => {
      animIdRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth, h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    })
    ro.observe(container)

    return () => {
      cancelAnimationFrame(animIdRef.current)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      controlsRef.current = null
      groupRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 2: rebuild geometry when deck state changes ────────────────────
  useEffect(() => {
    const group = groupRef.current
    if (!group) return

    clearGroup(group)
    group.rotation.y = DIR_ANGLE[wallDirection]

    const shape: DeckShape = customShape ?? getDeckCorners({
      wallLength, wallDirection, deckWidth, deckDepth,
      heightAboveGround, boardDirection,
    })

    // Ground
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshLambertMaterial({ color: 0xc8d8b0 }),
    )
    groundMesh.rotation.x = -Math.PI / 2
    group.add(groundMesh)

    // House wall
    const wallMesh = new THREE.Mesh(
      new THREE.BoxGeometry(wallLength, 3, 0.2),
      new THREE.MeshLambertMaterial({ color: 0xf0ece4 }),
    )
    wallMesh.position.set(0, 1.5, -0.1)
    group.add(wallMesh)

    if (viewLayer <= 3) {
      addStructureLayers(group, shape, heightAboveGround, viewLayer as 1 | 2 | 3)
      addStairs(group, stairs, shape, heightAboveGround)
      addPlanters(group, planters, shape, heightAboveGround)
    } else {
      const deckGeo = buildDeckGeometry(shape, heightAboveGround)
      group.add(new THREE.Mesh(deckGeo, new THREE.MeshLambertMaterial({ color: 0xc8a46e })))

      const topY = heightAboveGround + 0.005
      const boardSegs = getBoardLinesForShape(shape, boardDirection)
      if (boardSegs.length > 0) {
        const verts: number[] = []
        for (const [a, b] of boardSegs) verts.push(a.x, topY, a.y, b.x, topY, b.y)
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
        group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x7a5230 })))
      }

      addStairs(group, stairs, shape, heightAboveGround)
      addPlanters(group, planters, shape, heightAboveGround)
    }
  }, [
    wallLength, wallDirection, deckWidth, deckDepth, heightAboveGround, boardDirection,
    customShape, stairs, planters, viewLayer,
  ])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-3 right-3 flex overflow-hidden rounded-md border border-white/30 text-xs">
        {LAYERS.map((l, i) => (
          <button
            key={l.level}
            className={`px-3 py-1.5 transition-colors ${
              i > 0 ? 'border-l border-white/30' : ''
            } ${
              viewLayer === l.level
                ? 'bg-white/90 text-gray-800 font-medium'
                : 'bg-black/25 text-white hover:bg-black/40'
            }`}
            onClick={() => setViewLayer(l.level)}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  )
}
