/**
 * The AVID as a rotatable sphere, with the ship drawn in its actual attitude.
 *
 * Same frame as the geometry kernel: x east, y north (map direction A), z up. The sphere is
 * gridded into the 50 AVID windows; the six orientation markers sit on its surface; the hull
 * points its nose along Forward and its fin along Top. Drag to orbit.
 */
import { Line, OrbitControls, Text } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import {
  AZIMUTH_LABELS,
  MARKER_NAMES,
  fromAzPitch,
  markerDirection,
  starboardOf,
  windowDirection,
  type ArcColour,
  type Attitude,
  type AvidWindow,
  type MarkerName,
  type Vec3,
} from '../../domain/geometry';

const MARKER_COLOUR: Record<MarkerName, string> = {
  forward: '#ffffff',
  aft: '#8a8a8a',
  port: '#e04a3f',
  starboard: '#3fbf5a',
  top: '#f0c93c',
  bottom: '#3f7fe0',
};

const ARC_HEX: Record<ArcColour, string> = { black: '#111111', grey: '#9a9a94', white: '#fafafa' };

const v = (p: Vec3): [number, number, number] => [p.x, p.y, p.z];

function circlePoints(pitch: number, from = 0, to = 360, step = 5): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let a = from; a <= to; a += step) pts.push(v(fromAzPitch(a, pitch)));
  return pts;
}

function meridianPoints(az: number, fromPitch: number, toPitch: number, step = 5): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let p = fromPitch; p <= toPitch; p += step) pts.push(v(fromAzPitch(az, p)));
  return pts;
}

function Grid() {
  const lines = useMemo(() => {
    const out: { key: string; pts: [number, number, number][]; colour: string; width: number }[] = [];
    const ringColour = (pitch: number) => (Math.abs(pitch) === 15 ? '#e6c453' : Math.abs(pitch) === 45 ? '#5b8fd0' : '#5aa46a');
    for (const p of [-75, -45, -15, 15, 45, 75]) out.push({ key: `lat${p}`, pts: circlePoints(p), colour: ringColour(p), width: 1.2 });
    out.push({ key: 'equator', pts: circlePoints(0), colour: '#e6c453', width: 0.6 });
    for (let k = 0; k < 12; k++) {
      // window boundaries are at odd multiples of 15°
      const az = k * 30 + 15;
      out.push({ key: `mer${az}`, pts: meridianPoints(az, -45, 45), colour: '#7c7c76', width: 0.6 });
    }
    for (let k = 0; k < 6; k++) {
      const az = k * 60 + 30;
      out.push({ key: `gmer${az}u`, pts: meridianPoints(az, 45, 75), colour: '#7c7c76', width: 0.6 });
      out.push({ key: `gmer${az}l`, pts: meridianPoints(az, -75, -45), colour: '#7c7c76', width: 0.6 });
    }
    return out;
  }, []);
  return (
    <>
      {lines.map((l) => (
        <Line key={l.key} points={l.pts} color={l.colour} lineWidth={l.width} transparent opacity={0.9} />
      ))}
      {AZIMUTH_LABELS.map((label, i) =>
        i % 2 === 0 ? (
          <Text key={label} position={v(fromAzPitch(i * 30, 0)).map((c) => c * 1.12) as [number, number, number]} fontSize={0.09} color="#c8c6bc" anchorX="center" anchorY="middle">
            {label}
          </Text>
        ) : null,
      )}
      <Text position={[0, 0, 1.12]} fontSize={0.07} color="#c8c6bc" anchorX="center" anchorY="middle">
        +
      </Text>
      <Text position={[0, 0, -1.12]} fontSize={0.07} color="#c8c6bc" anchorX="center" anchorY="middle">
        −
      </Text>
    </>
  );
}

function Ship({ attitude }: { attitude: Attitude }) {
  const quaternion = useMemo(() => {
    const s = starboardOf(attitude);
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(s.x, s.y, s.z),
      new THREE.Vector3(attitude.forward.x, attitude.forward.y, attitude.forward.z),
      new THREE.Vector3(attitude.top.x, attitude.top.y, attitude.top.z),
    );
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }, [attitude]);
  // local frame: +x starboard, +y forward, +z top
  return (
    <group quaternion={quaternion}>
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[0.16, 0.5, 0.09]} />
        <meshStandardMaterial color="#c9c7bd" />
      </mesh>
      <mesh position={[0, 0.32, 0]}>
        <coneGeometry args={[0.08, 0.24, 20]} />
        <meshStandardMaterial color="#e6e4dc" />
      </mesh>
      <mesh position={[0, -0.15, 0.09]}>
        <boxGeometry args={[0.02, 0.18, 0.1]} />
        <meshStandardMaterial color="#f0c93c" />
      </mesh>
      <mesh position={[0.1, -0.05, 0]}>
        <boxGeometry args={[0.04, 0.3, 0.03]} />
        <meshStandardMaterial color="#3fbf5a" />
      </mesh>
      <mesh position={[-0.1, -0.05, 0]}>
        <boxGeometry args={[0.04, 0.3, 0.03]} />
        <meshStandardMaterial color="#e04a3f" />
      </mesh>
    </group>
  );
}

function Markers({ attitude }: { attitude: Attitude }) {
  return (
    <>
      {MARKER_NAMES.map((name) => {
        const d = markerDirection(attitude, name);
        const p = v(d);
        return (
          <group key={name}>
            <Line points={[[0, 0, 0], p]} color={MARKER_COLOUR[name]} lineWidth={1} transparent opacity={0.5} />
            <mesh position={p}>
              <sphereGeometry args={[0.035, 16, 16]} />
              <meshStandardMaterial color={MARKER_COLOUR[name]} />
            </mesh>
            <Text position={p.map((c) => c * 1.08) as [number, number, number]} fontSize={0.06} color={MARKER_COLOUR[name]} anchorX="center" anchorY="middle">
              {name}
            </Text>
          </group>
        );
      })}
    </>
  );
}

export interface AvidSphereProps {
  readonly attitude: Attitude;
  /** A bearing to draw from the ship, coloured by how the selected mount sees it. */
  readonly bearing?: { window: AvidWindow; colour: ArcColour } | undefined;
}

export function AvidSphere({ attitude, bearing }: AvidSphereProps) {
  const bearingPts = bearing ? [[0, 0, 0] as [number, number, number], v(windowDirection(bearing.window)).map((c) => c * 1.3) as [number, number, number]] : null;
  return (
    <Canvas camera={{ position: [2.4, -2.6, 1.6], up: [0, 0, 1], fov: 40 }} dpr={[1, 2]}>
      <ambientLight intensity={0.9} />
      <directionalLight position={[4, -3, 6]} intensity={1.2} />
      <mesh>
        <sphereGeometry args={[1, 48, 32]} />
        <meshStandardMaterial color="#8d97a8" transparent opacity={0.12} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <Grid />
      <Ship attitude={attitude} />
      <Markers attitude={attitude} />
      {bearingPts && bearing && <Line points={bearingPts} color={ARC_HEX[bearing.colour]} lineWidth={3} />}
      <OrbitControls makeDefault enablePan={false} minDistance={1.8} maxDistance={6} />
    </Canvas>
  );
}
