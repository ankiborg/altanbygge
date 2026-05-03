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
import type { DeckShape, WallDirection, Stair, PlanterBox } from '@/types/deck'

const DIR_ANGLE: Record<WallDirection, number> = {
  south: 0,
  west:  Math.PI / 2,
  north: Math.PI,
  east:  -Math.PI / 2,
}

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
      // Rotate box so local X → nA, local Z → nB
      const rotY = Math.atan2(-nA.y, nA.x)

      // Each slab is a growing square filling the corner: s=0 is closest (smallest)
      for (let s = 0; s < steps; s++) {
        const size = (s + 1) * STEP_DEPTH
        const slabH = Math.max(0.01, heightAboveGround - (s + 1) * STEP_RISE)
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(size, slabH, size),
          mat,
        )
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

      // Slab approach: s=0 is the step closest to the deck (one step below it)
      for (let s = 0; s < steps; s++) {
        const distFromEdge = (s + 0.5) * STEP_DEPTH
        const slabH = Math.max(0.01, heightAboveGround - (s + 1) * STEP_RISE)
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(stair.width, slabH, STEP_DEPTH),
          mat,
        )
        mesh.rotation.y = rotY
        mesh.position.set(
          cx + nx * distFromEdge,
          slabH / 2,
          cz + nz * distFromEdge,
        )
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

    // Planter sits on the ground, inner face touching the deck edge
    const corners = getPlanterCorners(edge, pl)
    // Centre in XZ is midpoint between inner and outer face along the outward normal
    const innerCx = (corners[0].x + corners[1].x) / 2
    const innerCz = (corners[0].y + corners[1].y) / 2
    const cx = innerCx + (pl.boxDepth / 2) * edge.outNormal.x
    const cz = innerCz + (pl.boxDepth / 2) * edge.outNormal.y

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(pl.width, heightAboveGround, pl.boxDepth),
      mat,
    )
    // Rotate so the box's width-axis aligns with the edge tangent
    const tx = edge.to.x - edge.from.x
    const tz = edge.to.y - edge.from.y
    const tLen = Math.sqrt(tx * tx + tz * tz)
    if (tLen > 0) mesh.rotation.y = -Math.atan2(tz / tLen, tx / tLen)
    mesh.position.set(cx, heightAboveGround / 2, cz)
    group.add(mesh)
  }
}

export default function PerspectiveView() {
  const containerRef = useRef<HTMLDivElement>(null)

  const {
    wallLength, wallDirection, deckWidth, deckDepth,
    heightAboveGround, boardDirection, customShape,
    stairs, planters,
  } = useDeckStore()

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const W = container.clientWidth
    const H = container.clientHeight

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xeef2ee)

    const shape: DeckShape = customShape ?? getDeckCorners({
      wallLength, wallDirection, deckWidth, deckDepth,
      heightAboveGround, boardDirection,
    })
    const xs = shape.map(p => p.x), ys = shape.map(p => p.y)
    const spanX = Math.max(...xs) - Math.min(...xs)
    const spanZ = Math.max(...ys) - Math.min(...ys)
    const sceneSize = Math.max(wallLength, spanX, spanZ)
    const midZ = spanZ / 2

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 200)
    camera.position.set(sceneSize * 1.0, sceneSize * 0.9, sceneSize * 1.5)
    camera.lookAt(0, heightAboveGround / 2, midZ)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(W, H)
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, heightAboveGround / 2, midZ)
    controls.enableDamping = true
    controls.dampingFactor = 0.08

    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const sun = new THREE.DirectionalLight(0xffffff, 0.9)
    sun.position.set(5, 10, 8)
    scene.add(sun)

    const group = new THREE.Group()
    group.rotation.y = DIR_ANGLE[wallDirection]
    scene.add(group)

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshLambertMaterial({ color: 0xc8d8b0 }),
    )
    ground.rotation.x = -Math.PI / 2
    group.add(ground)

    // House wall
    const wallMesh = new THREE.Mesh(
      new THREE.BoxGeometry(wallLength, 3, 0.2),
      new THREE.MeshLambertMaterial({ color: 0xf0ece4 }),
    )
    wallMesh.position.set(0, 1.5, -0.1)
    group.add(wallMesh)

    // Deck
    const deckGeo = buildDeckGeometry(shape, heightAboveGround)
    group.add(new THREE.Mesh(deckGeo, new THREE.MeshLambertMaterial({ color: 0xc8a46e })))

    // Board lines
    const topY = heightAboveGround + 0.005
    const boardSegs = getBoardLinesForShape(shape, boardDirection)
    if (boardSegs.length > 0) {
      const verts: number[] = []
      for (const [a, b] of boardSegs) {
        verts.push(a.x, topY, a.y, b.x, topY, b.y)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
      group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x7a5230 })))
    }

    // Stairs
    addStairs(group, stairs, shape, heightAboveGround)

    // Planters
    addPlanters(group, planters, shape, heightAboveGround)

    let animId: number
    const animate = () => {
      animId = requestAnimationFrame(animate)
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
      cancelAnimationFrame(animId)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
    }
  }, [
    wallLength, wallDirection, deckWidth, deckDepth, heightAboveGround, boardDirection,
    customShape, stairs, planters,
  ])

  return <div ref={containerRef} className="w-full h-full" />
}
