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
  BOARD_W, BOARD_T,
  JOIST_W, JOIST_H, BEAM_W, BEAM_H, POST_W, FOOTING_W, FOOTING_H,
  MAX_CANTILEVER,
  PERGOLA_POST_W, PERGOLA_BEAM_W, PERGOLA_BEAM_H,
  PERGOLA_RAFTER_W, PERGOLA_RAFTER_H, PERGOLA_RAFTER_OV,
  PERGOLA_POST_BASE_W, PERGOLA_POST_BASE_H,
  getJoistXPositions, getPostXPositions, getBeamYPositions, beamXExtent, joistYExtent,
  spanPositions,
} from '@/utils/structure'
import { pieceId } from '@/utils/cutList'
import type { DeckShape, WallDirection, Stair, PlanterBox, Pergola } from '@/types/deck'
import DetailPanel from '@/components/ui/DetailPanel'

const DIR_ANGLE: Record<WallDirection, number> = {
  south: 0,
  west:  Math.PI / 2,
  north: Math.PI,
  east:  -Math.PI / 2,
}

const LAYERS = [
  { level: 1 as const, label: 'Plintar'  },
  { level: 2 as const, label: 'Balkar'   },
  { level: 3 as const, label: 'Reglar'   },
  { level: 4 as const, label: 'Trall'    },
  { level: 5 as const, label: 'Detaljer' },
]

type MeshMap = Map<string, THREE.Mesh>


function addFasciaBoards(
  group: THREE.Group,
  meshMap: MeshMap,
  shape: DeckShape,
  heightAboveGround: number,
) {
  const mat   = new THREE.MeshLambertMaterial({ color: 0x8b6530 })
  const edges = getEdgeDims(shape)
  const numRows = Math.ceil(heightAboveGround / BOARD_W)

  for (let ei = 0; ei < edges.length; ei++) {
    const edge = edges[ei]
    if (edge.from.y < 0.01 && edge.to.y < 0.01) continue

    const tx = edge.to.x - edge.from.x, tz = edge.to.y - edge.from.y
    const tl = Math.sqrt(tx * tx + tz * tz)
    if (tl < 0.01) continue
    const rotY = -Math.atan2(tz / tl, tx / tl)

    for (let r = 0; r < numRows; r++) {
      const centerY = heightAboveGround - (r + 0.5) * BOARD_W
      const board = new THREE.Mesh(new THREE.BoxGeometry(edge.length, BOARD_W, BOARD_T), mat)
      board.rotation.y = rotY
      board.position.set(
        edge.mid.x - edge.outNormal.x * (BOARD_T / 2),
        centerY,
        edge.mid.y - edge.outNormal.y * (BOARD_T / 2),
      )
      const id = `fascia-${ei}-${r}`
      board.userData.id = id; board.userData.kind = 'fasciabräda'
      meshMap.set(id, board); group.add(board)
    }
  }
}

// Corner stair slab — outer corner is the intersection of the two offset lines
// (one parallel to each edge at depth d), not their vector sum, so the shape
// never arrows out at non-90° corners.
function buildCornerStepGeo(
  anchor: { x: number; y: number },
  nA: { x: number; y: number },
  nB: { x: number; y: number },
  step: number,
  slabH: number,
): THREE.BufferGeometry {
  const d   = (step + 1) * STEP_DEPTH
  const det = nA.y * nB.x - nA.x * nB.y
  let ox: number, oy: number
  if (Math.abs(det) < 0.001) {
    ox = anchor.x + d * nA.x + d * nB.x
    oy = anchor.y + d * nA.y + d * nB.y
  } else {
    const t = d * (1 - (nA.x * nB.x + nA.y * nB.y)) / det
    ox = anchor.x + d * nA.x + t * nA.y
    oy = anchor.y + d * nA.y - t * nA.x
  }
  const s = new THREE.Shape([
    new THREE.Vector2(anchor.x,           -anchor.y),
    new THREE.Vector2(anchor.x + d * nA.x, -(anchor.y + d * nA.y)),
    new THREE.Vector2(ox,                  -oy),
    new THREE.Vector2(anchor.x + d * nB.x, -(anchor.y + d * nB.y)),
  ])
  const geo = new THREE.ExtrudeGeometry(s, { depth: slabH, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2)
  return geo
}

function addStairs(
  group: THREE.Group,
  meshMap: MeshMap,
  stairs: Stair[],
  shape: DeckShape,
  heightAboveGround: number,
) {
  const mat   = new THREE.MeshLambertMaterial({ color: 0xc8a46e })
  const edges = getEdgeDims(shape)
  const steps = numSteps(heightAboveGround)

  for (let si = 0; si < stairs.length; si++) {
    const stair = stairs[si]

    if (stair.kind === 'corner') {
      const n      = shape.length
      const anchor = shape[stair.cornerIndex]
      if (!anchor) continue
      const nA = edges[(stair.cornerIndex - 1 + n) % n].outNormal
      const nB = edges[stair.cornerIndex].outNormal

      for (let s = 0; s < steps; s++) {
        const slabH = Math.max(0.01, heightAboveGround - (s + 1) * STEP_RISE)
        const geo   = buildCornerStepGeo(anchor, nA, nB, s, slabH)
        const mesh  = new THREE.Mesh(geo, mat)
        // Register under all kaplist IDs (2 rows × 2 arms) so selection works
        const primaryId = pieceId.stair(si, s, 0, 'A')
        mesh.userData.id = primaryId; mesh.userData.kind = 'trappbräda'
        for (const r of [0, 1] as const)
          for (const arm of ['A', 'B'] as const)
            meshMap.set(pieceId.stair(si, s, r, arm), mesh)
        group.add(mesh)
      }
    } else {
      const edge  = edges[stair.edgeIndex]
      if (!edge) continue
      const corners = getStairCorners(edge, stair, steps)
      const cx  = (corners[0].x + corners[1].x) / 2
      const cz  = (corners[0].y + corners[1].y) / 2
      const nx  = edge.outNormal.x, nz = edge.outNormal.y
      const tx  = edge.to.x - edge.from.x, tz = edge.to.y - edge.from.y
      const tl  = Math.sqrt(tx * tx + tz * tz)
      const rotY = tl > 0 ? -Math.atan2(tz / tl, tx / tl) : 0

      for (let s = 0; s < steps; s++) {
        const slabH = Math.max(0.01, heightAboveGround - (s + 1) * STEP_RISE)
        const mesh  = new THREE.Mesh(new THREE.BoxGeometry(stair.width, slabH, STEP_DEPTH), mat)
        mesh.rotation.y = rotY
        mesh.position.set(cx + nx * (s + 0.5) * STEP_DEPTH, slabH / 2, cz + nz * (s + 0.5) * STEP_DEPTH)
        // Register under both row IDs so kaplist scroll-sync works for both rows
        const primaryId = pieceId.stair(si, s, 0)
        mesh.userData.id = primaryId; mesh.userData.kind = 'trappbräda'
        meshMap.set(pieceId.stair(si, s, 0), mesh)
        meshMap.set(pieceId.stair(si, s, 1), mesh)
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
  const mat   = new THREE.MeshLambertMaterial({ color: 0x7a5c1e })
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
    const tx = edge.to.x - edge.from.x, tz = edge.to.y - edge.from.y
    const tl = Math.sqrt(tx * tx + tz * tz)
    if (tl > 0) mesh.rotation.y = -Math.atan2(tz / tl, tx / tl)
    mesh.position.set(cx, heightAboveGround / 2, cz)
    group.add(mesh)
  }
}

function addStructureLayers(
  group: THREE.Group,
  meshMap: MeshMap,
  shape: DeckShape,
  heightAboveGround: number,
  maxLayer: 1 | 2 | 3,
) {
  const woodMat     = new THREE.MeshLambertMaterial({ color: 0x8b6530 })
  const concreteMat = new THREE.MeshLambertMaterial({ color: 0xaaaaaa })

  const xs = shape.map(p => p.x), ys = shape.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)

  const beamCenterY  = heightAboveGround - JOIST_H - BEAM_H / 2
  const joistCenterY = heightAboveGround - JOIST_H / 2
  const postH        = Math.max(0.01, heightAboveGround - JOIST_H - BEAM_H - FOOTING_H)
  const beamYs       = getBeamYPositions(minY, maxY, shape)

  // Layer 1 — footings + posts
  let postIdx = 0
  for (let bi = 1; bi < beamYs.length; bi++) {
    const by  = beamYs[bi]
    const fz  = bi === beamYs.length - 1 ? by - FOOTING_W / 2 : by
    const ext = beamXExtent(shape, by, minY, maxY, minX, maxX)
    for (const px of getPostXPositions(ext.minX, ext.maxX)) {
      const half = FOOTING_W / 2
      const fxF = Math.max(ext.minX + half, Math.min(ext.maxX - half, px))
      const yExt = joistYExtent(shape, fxF, minX, maxX)
      const fzF = yExt
        ? Math.max(yExt.minY + half, Math.min(yExt.maxY - half, fz))
        : Math.max(minY + half, Math.min(maxY - half, fz))
      const footing = new THREE.Mesh(new THREE.BoxGeometry(FOOTING_W, FOOTING_H, FOOTING_W), concreteMat)
      footing.position.set(fxF, FOOTING_H / 2, fzF)
      group.add(footing)

      if (postH > 0) {
        const postRenderH = Math.max(0.01, heightAboveGround - JOIST_H - BEAM_H)
        const post = new THREE.Mesh(new THREE.BoxGeometry(POST_W, postRenderH, POST_W), woodMat)
        post.position.set(fxF, postRenderH / 2, fzF)
        const id = pieceId.post(bi, postIdx)
        post.userData.id = id; post.userData.kind = 'stolpe'
        meshMap.set(id, post); group.add(post)
      }
      postIdx++
    }
  }

  if (maxLayer < 2) return

  // Layer 2 — beams
  for (let bi = 0; bi < beamYs.length; bi++) {
    const by    = beamYs[bi]
    const ext   = beamXExtent(shape, by, minY, maxY, minX, maxX)
    const bw    = ext.maxX - ext.minX
    const bMidX = (ext.minX + ext.maxX) / 2
    const bz    = bi === 0 ? minY + BEAM_W / 2 : bi === beamYs.length - 1 ? by - FOOTING_W / 2 : by
    const beam  = new THREE.Mesh(new THREE.BoxGeometry(bw, BEAM_H, BEAM_W), woodMat)
    beam.position.set(bMidX, beamCenterY, bz)
    const id = pieceId.beam(bi)
    beam.userData.id = id; beam.userData.kind = 'balk'
    meshMap.set(id, beam); group.add(beam)
  }

  if (maxLayer < 3) return

  // Layer 3 — joists
  const ε = 0.001
  let ji = 0
  for (const jx of getJoistXPositions(minX, maxX)) {
    const ext = joistYExtent(shape, jx, minX, maxX)
    if (!ext) { ji++; continue }

    let outerBeamY = ext.minY
    for (let bi = beamYs.length - 1; bi >= 0; bi--) {
      const by   = beamYs[bi]
      if (by > ext.maxY + ε) continue
      const bext = beamXExtent(shape, by, minY, maxY, minX, maxX)
      if (bext.minX <= jx + ε && bext.maxX >= jx - ε) { outerBeamY = by; break }
    }

    const jMaxY = Math.min(ext.maxY, outerBeamY + MAX_CANTILEVER)
    if (jMaxY > ext.minY + ε) {
      const jLen  = jMaxY - ext.minY
      const joist = new THREE.Mesh(new THREE.BoxGeometry(JOIST_W, JOIST_H, jLen), woodMat)
      joist.position.set(jx, joistCenterY, (ext.minY + jMaxY) / 2)
      const id = pieceId.joist(ji)
      joist.userData.id = id; joist.userData.kind = 'regel'
      meshMap.set(id, joist); group.add(joist)
    }
    ji++
  }
}

function addPergolas(
  group: THREE.Group,
  meshMap: MeshMap,
  pergolas: Pergola[],
  heightAboveGround: number,
) {
  const woodMat  = new THREE.MeshLambertMaterial({ color: 0x8b6530 })
  const metalMat = new THREE.MeshLambertMaterial({ color: 0x888888 })
  const h = heightAboveGround

  for (let pi = 0; pi < pergolas.length; pi++) {
    const pg = pergolas[pi]
    const { x, y, width, depth, height, rafterCC } = pg
    const topY = h + PERGOLA_POST_BASE_H + height

    const corners = [
      { x: x - width / 2, z: y - depth / 2 },
      { x: x + width / 2, z: y - depth / 2 },
      { x: x + width / 2, z: y + depth / 2 },
      { x: x - width / 2, z: y + depth / 2 },
    ]

    // Stolpskor (post shoes)
    for (const c of corners) {
      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(PERGOLA_POST_BASE_W, PERGOLA_POST_BASE_H, PERGOLA_POST_BASE_W),
        metalMat,
      )
      shoe.position.set(c.x, h + PERGOLA_POST_BASE_H / 2, c.z)
      group.add(shoe)
    }

    // Stolpar (posts)
    for (let i = 0; i < corners.length; i++) {
      const c = corners[i]
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(PERGOLA_POST_W, height, PERGOLA_POST_W),
        woodMat,
      )
      post.position.set(c.x, h + PERGOLA_POST_BASE_H + height / 2, c.z)
      const id = `pergola-${pi}-post-${i}`
      post.userData.id = id; post.userData.kind = 'stolpe'
      meshMap.set(id, post); group.add(post)
    }

    // Hammarband (beams along X, one per Z side)
    for (let bi = 0; bi < 2; bi++) {
      const bz = bi === 0 ? y - depth / 2 : y + depth / 2
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(width, PERGOLA_BEAM_H, PERGOLA_BEAM_W),
        woodMat,
      )
      beam.position.set(x, topY - PERGOLA_BEAM_H / 2, bz)
      const id = `pergola-${pi}-beam-${bi}`
      beam.userData.id = id; beam.userData.kind = 'balk'
      meshMap.set(id, beam); group.add(beam)
    }

    // Sparrar (rafters along Z)
    const rafterLen = depth + 2 * PERGOLA_RAFTER_OV
    const rafterXs  = spanPositions(x - width / 2, x + width / 2, rafterCC)
    for (let ri = 0; ri < rafterXs.length; ri++) {
      const rafter = new THREE.Mesh(
        new THREE.BoxGeometry(PERGOLA_RAFTER_W, PERGOLA_RAFTER_H, rafterLen),
        woodMat,
      )
      rafter.position.set(rafterXs[ri], topY + PERGOLA_RAFTER_H / 2, y)
      const id = `pergola-${pi}-rafter-${ri}`
      rafter.userData.id = id; rafter.userData.kind = 'regel'
      meshMap.set(id, rafter); group.add(rafter)
    }
  }
}

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
    stairs, planters, pergolas, viewLayer, setViewLayer,
    selectedPieceId,
  } = useDeckStore()

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

  const sceneRef    = useRef<THREE.Scene | null>(null)
  const groupRef    = useRef<THREE.Group | null>(null)
  const cameraRef   = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const animIdRef   = useRef<number>(0)

  const meshMapRef     = useRef<MeshMap>(new Map())
  const highlightedRef = useRef<{ mesh: THREE.Mesh; origMat: THREE.Material | THREE.Material[] } | null>(null)
  const highlightMat   = useRef(new THREE.MeshLambertMaterial({ color: 0xff6600, emissive: new THREE.Color(0.4, 0.15, 0), emissiveIntensity: 1 }))
  const selectedIdRef  = useRef(selectedPieceId)
  useEffect(() => { selectedIdRef.current = selectedPieceId }, [selectedPieceId])

  // ── Effect 1: mount renderer / camera / controls ──────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const W = container.clientWidth, H = container.clientHeight
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

    // Raycasting click handler
    const handleClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      const x =  ((e.clientX - rect.left)  / rect.width)  * 2 - 1
      const y = -((e.clientY - rect.top)   / rect.height) * 2 + 1
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera)
      const hits = raycaster.intersectObjects(group.children, true)
      const hit  = hits.find(h => (h.object as THREE.Mesh).userData?.id)
      useDeckStore.getState().setSelectedPiece(hit ? (hit.object as THREE.Mesh).userData.id : null)
    }
    renderer.domElement.addEventListener('click', handleClick)

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
      renderer.domElement.removeEventListener('click', handleClick)
      renderer.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      controlsRef.current = null
      groupRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 2: rebuild geometry ────────────────────────────────────────────
  useEffect(() => {
    const group = groupRef.current
    if (!group) return

    clearGroup(group)
    highlightedRef.current = null
    meshMapRef.current.clear()

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

    const meshMap = meshMapRef.current

    if (viewLayer <= 3) {
      addStructureLayers(group, meshMap, shape, heightAboveGround, viewLayer as 1 | 2 | 3)
      addStairs(group, meshMap, stairs, shape, heightAboveGround)
      addPlanters(group, planters, shape, heightAboveGround)
      addPergolas(group, meshMap, pergolas, heightAboveGround)
    } else {
      // Layer 4+: complete view — full structure + individual board meshes on top
      addStructureLayers(group, meshMap, shape, heightAboveGround, 3)

      const boardSegs = getBoardLinesForShape(shape, boardDirection)
      const boardMat  = new THREE.MeshLambertMaterial({ color: 0xc8a46e })
      for (let bdi = 0; bdi < boardSegs.length; bdi++) {
        const { a, b, width: bw } = boardSegs[bdi]
        const dx = b.x - a.x, dz = b.y - a.y
        const len = Math.sqrt(dx * dx + dz * dz)
        if (len < 0.01) continue
        const board = new THREE.Mesh(new THREE.BoxGeometry(len, BOARD_T, bw), boardMat)
        board.rotation.y = -Math.atan2(dz, dx)
        board.position.set((a.x + b.x) / 2, heightAboveGround + BOARD_T / 2, (a.y + b.y) / 2)
        const id = pieceId.board(bdi)
        board.userData.id = id; board.userData.kind = 'trall'
        meshMap.set(id, board); group.add(board)
      }

      addStairs(group, meshMap, stairs, shape, heightAboveGround)
      addFasciaBoards(group, meshMap, shape, heightAboveGround)
      addPlanters(group, planters, shape, heightAboveGround)
    }

    addPergolas(group, meshMap, pergolas, heightAboveGround)

    // Re-apply selection highlight after rebuild
    const curId = selectedIdRef.current
    if (curId) {
      const mesh = meshMap.get(curId)
      if (mesh) {
        highlightedRef.current = { mesh, origMat: mesh.material }
        mesh.material = highlightMat.current
      }
    }
  }, [
    wallLength, wallDirection, deckWidth, deckDepth, heightAboveGround, boardDirection,
    customShape, stairs, planters, pergolas, viewLayer,
  ])

  // ── Effect 3: update highlight when selection changes ─────────────────────
  useEffect(() => {
    if (highlightedRef.current) {
      highlightedRef.current.mesh.material = highlightedRef.current.origMat as THREE.Material
      highlightedRef.current = null
    }
    if (selectedPieceId) {
      const mesh = meshMapRef.current.get(selectedPieceId)
      if (mesh) {
        highlightedRef.current = { mesh, origMat: mesh.material }
        mesh.material = highlightMat.current
      }
    }
  }, [selectedPieceId])

  return (
    <div className="flex flex-col w-full h-full">
      {/* 3D canvas + layer buttons */}
      <div className="relative flex-1 min-h-0">
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

      {/* Detaljer panel — below 3D */}
      {viewLayer === 5 && (
        <div className="h-[260px] shrink-0 border-t border-slate-200 overflow-hidden">
          <DetailPanel />
        </div>
      )}
    </div>
  )
}
