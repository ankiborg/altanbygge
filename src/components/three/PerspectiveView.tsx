import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useDeckStore } from '@/store/deckStore'
import { getDeckCorners } from '@/utils/geometry'
import { getBoardLinesForShape } from '@/utils/polygon'
import type { DeckShape, WallDirection } from '@/types/deck'

const DIR_ANGLE: Record<WallDirection, number> = {
  south: 0,
  west:  Math.PI / 2,
  north: Math.PI,
  east:  -Math.PI / 2,
}

function buildDeckGeometry(shape: DeckShape, height: number): THREE.BufferGeometry {
  // THREE.Shape uses XY; we map deck (x, z_world) → (x, -z_world) then rotateX(-π/2)
  // so that z_world becomes +Z in Three.js world space
  const s = new THREE.Shape()
  s.moveTo(shape[0].x, -shape[0].y)
  for (let i = 1; i < shape.length; i++) s.lineTo(shape[i].x, -shape[i].y)
  s.closePath()

  const geo = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2)
  return geo
}

export default function PerspectiveView() {
  const containerRef = useRef<HTMLDivElement>(null)

  const {
    wallLength, wallDirection, deckWidth, deckDepth,
    heightAboveGround, boardDirection, customShape,
  } = useDeckStore()

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const W = container.clientWidth
    const H = container.clientHeight

    // --- Scene ---
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xeef2ee)

    // --- Camera ---
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

    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(W, H)
    container.appendChild(renderer.domElement)

    // --- Controls ---
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, heightAboveGround / 2, midZ)
    controls.enableDamping = true
    controls.dampingFactor = 0.08

    // --- Lights ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const sun = new THREE.DirectionalLight(0xffffff, 0.9)
    sun.position.set(5, 10, 8)
    scene.add(sun)

    // --- Scene group (rotated by wall direction) ---
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

    // Board lines on deck top surface
    const topY = heightAboveGround + 0.005
    const boardSegs = getBoardLinesForShape(shape, boardDirection)
    if (boardSegs.length > 0) {
      const verts: number[] = []
      for (const [a, b] of boardSegs) {
        // shape coords: (x, y_shape) → 3D: (x, topY, y_shape) since depth = y_shape
        verts.push(a.x, topY, a.y, b.x, topY, b.y)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
      group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x7a5230 })))
    }

    // --- Render loop ---
    let animId: number
    const animate = () => {
      animId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // --- Resize ---
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
  }, [wallLength, wallDirection, deckWidth, deckDepth, heightAboveGround, boardDirection, customShape])

  return <div ref={containerRef} className="w-full h-full" />
}
