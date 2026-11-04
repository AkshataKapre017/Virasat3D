"""Generic, deterministic procedural architecture engine.

The engine is deliberately data-driven: a single set of reusable component builders (boxes,
cylinders, domes, arches, steps, pillars, walls, windows and carved bands) is composed by a small
number of *typology* templates.  A heritage site only supplies configuration - typology plus
dimensions/options - so adding a new site never means writing another site-specific generator.

The output is a lightweight vertex-coloured GLB mesh suitable for the existing React Three Fiber
viewer.  It is a typology reconstruction, not a measured survey; the API labels it as approximate.
"""

from __future__ import annotations

import hashlib
import json
import struct
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Protocol

import numpy as np

from app.services.twins import PointCloud, kund_stepwell, vav_stepwell, write_ply

DATA_FILE = Path(__file__).resolve().parent / "data" / "procedural_profiles.json"

SANDSTONE = (0.72, 0.53, 0.33)
SANDSTONE_LIGHT = (0.84, 0.68, 0.47)
SANDSTONE_DARK = (0.42, 0.29, 0.19)
WATER = (0.13, 0.33, 0.42)
GROUND = (0.55, 0.45, 0.33)
ACCENT = (0.62, 0.38, 0.20)
DARK = (0.20, 0.14, 0.10)


class SiteLike(Protocol):
    """The subset of ``Site`` the engine needs (keeps it independent of the database layer)."""

    slug: str
    name: str
    category: str
    tags: list[str]


@dataclass(slots=True)
class MeshData:
    positions: np.ndarray
    normals: np.ndarray
    colors: np.ndarray
    indices: np.ndarray

    @property
    def vertex_count(self) -> int:
        return int(self.positions.shape[0])

    @property
    def triangle_count(self) -> int:
        return int(self.indices.shape[0] // 3)


@dataclass(slots=True)
class _Builder:
    positions: list[np.ndarray] = field(default_factory=list)
    normals: list[np.ndarray] = field(default_factory=list)
    colors: list[np.ndarray] = field(default_factory=list)
    indices: list[int] = field(default_factory=list)

    def _quad(self, a: np.ndarray, b: np.ndarray, c: np.ndarray, d: np.ndarray, color: tuple[float, ...]) -> None:
        normal = np.cross(b - a, d - a)
        length = float(np.linalg.norm(normal))
        if length < 1e-9:
            return
        normal = (normal / length).astype(np.float32)
        base = len(self.indices)
        for point in (a, b, c, d):
            self.positions.append(point.astype(np.float32))
            self.normals.append(normal)
            self.colors.append(np.asarray(color[:3], dtype=np.float32))
        self.indices.extend((base, base + 1, base + 2, base, base + 2, base + 3))

    def _tri(self, a: np.ndarray, b: np.ndarray, c: np.ndarray, color: tuple[float, ...]) -> None:
        normal = np.cross(b - a, c - a)
        length = float(np.linalg.norm(normal))
        if length < 1e-9:
            return
        normal = (normal / length).astype(np.float32)
        base = len(self.indices)
        for point in (a, b, c):
            self.positions.append(point.astype(np.float32))
            self.normals.append(normal)
            self.colors.append(np.asarray(color[:3], dtype=np.float32))
        self.indices.extend((base, base + 1, base + 2))

    def box(
        self,
        x0: float,
        x1: float,
        y0: float,
        y1: float,
        z0: float,
        z1: float,
        color: tuple[float, ...] = SANDSTONE,
    ) -> None:
        if x1 < x0:
            x0, x1 = x1, x0
        if y1 < y0:
            y0, y1 = y1, y0
        if z1 < z0:
            z0, z1 = z1, z0
        p = {
            "000": np.array([x0, y0, z0]),
            "100": np.array([x1, y0, z0]),
            "110": np.array([x1, y1, z0]),
            "010": np.array([x0, y1, z0]),
            "001": np.array([x0, y0, z1]),
            "101": np.array([x1, y0, z1]),
            "111": np.array([x1, y1, z1]),
            "011": np.array([x0, y1, z1]),
        }
        self._quad(p["000"], p["100"], p["110"], p["010"], color)  # -z
        self._quad(p["001"], p["011"], p["111"], p["101"], color)  # +z
        self._quad(p["000"], p["001"], p["101"], p["100"], color)  # -y
        self._quad(p["010"], p["110"], p["111"], p["011"], color)  # +y
        self._quad(p["000"], p["010"], p["011"], p["001"], color)  # -x
        self._quad(p["100"], p["101"], p["111"], p["110"], color)  # +x

    def cylinder(
        self,
        cx: float,
        cz: float,
        radius: float,
        y0: float,
        y1: float,
        color: tuple[float, ...] = SANDSTONE,
        *,
        segments: int = 16,
    ) -> None:
        if y1 < y0:
            y0, y1 = y1, y0
        angles = np.linspace(0.0, 2.0 * np.pi, segments, endpoint=False)
        for i, angle in enumerate(angles):
            nxt = angles[(i + 1) % segments]
            a = np.array([cx + radius * np.cos(angle), y0, cz + radius * np.sin(angle)])
            b = np.array([cx + radius * np.cos(nxt), y0, cz + radius * np.sin(nxt)])
            c = np.array([cx + radius * np.cos(nxt), y1, cz + radius * np.sin(nxt)])
            d = np.array([cx + radius * np.cos(angle), y1, cz + radius * np.sin(angle)])
            self._quad(a, b, c, d, color)
        center_bottom = np.array([cx, y0, cz])
        center_top = np.array([cx, y1, cz])
        for i, angle in enumerate(angles):
            nxt = angles[(i + 1) % segments]
            b = np.array([cx + radius * np.cos(angle), y0, cz + radius * np.sin(angle)])
            c = np.array([cx + radius * np.cos(nxt), y0, cz + radius * np.sin(nxt)])
            self._tri(center_bottom, c, b, color)
            b_top = np.array([cx + radius * np.cos(angle), y1, cz + radius * np.sin(angle)])
            c_top = np.array([cx + radius * np.cos(nxt), y1, cz + radius * np.sin(nxt)])
            self._tri(center_top, b_top, c_top, color)

    def dome(
        self,
        cx: float,
        cz: float,
        radius: float,
        y0: float,
        color: tuple[float, ...] = SANDSTONE_LIGHT,
        *,
        segments: int = 20,
        rings: int = 7,
    ) -> None:
        """Hemisphere built from latitude/longitude quads (real mesh, so wireframe works)."""
        for r in range(rings):
            phi0 = (np.pi / 2.0) * r / rings
            phi1 = (np.pi / 2.0) * (r + 1) / rings
            for s in range(segments):
                th0 = 2.0 * np.pi * s / segments
                th1 = 2.0 * np.pi * (s + 1) / segments
                p00 = np.array(
                    [cx + radius * np.cos(phi0) * np.cos(th0), y0 + radius * np.sin(phi0), cz + radius * np.cos(phi0) * np.sin(th0)]
                )
                p10 = np.array(
                    [cx + radius * np.cos(phi0) * np.cos(th1), y0 + radius * np.sin(phi0), cz + radius * np.cos(phi0) * np.sin(th1)]
                )
                p11 = np.array(
                    [cx + radius * np.cos(phi1) * np.cos(th1), y0 + radius * np.sin(phi1), cz + radius * np.cos(phi1) * np.sin(th1)]
                )
                p01 = np.array(
                    [cx + radius * np.cos(phi1) * np.cos(th0), y0 + radius * np.sin(phi1), cz + radius * np.cos(phi1) * np.sin(th0)]
                )
                self._quad(p00, p10, p11, p01, color)

    def arch(
        self,
        cx: float,
        y_base: float,
        z0: float,
        z1: float,
        radius: float,
        color: tuple[float, ...] = SANDSTONE_LIGHT,
        *,
        segments: int = 9,
        thickness: float = 0.45,
    ) -> None:
        """Semicircular arch ring in the XY plane, extruded through z."""
        for i in range(segments):
            a0 = np.pi * i / segments
            a1 = np.pi * (i + 1) / segments
            for angle, nxt in ((a0, a1),):
                inner = radius - thickness
                p0 = np.array([cx + inner * np.cos(angle), y_base + inner * np.sin(angle), z0])
                p1 = np.array([cx + radius * np.cos(angle), y_base + radius * np.sin(angle), z0])
                p2 = np.array([cx + radius * np.cos(nxt), y_base + radius * np.sin(nxt), z0])
                p3 = np.array([cx + inner * np.cos(nxt), y_base + inner * np.sin(nxt), z0])
                self._quad(p0, p1, p2, p3, color)
                p4 = p0.copy()
                p5 = p1.copy()
                p6 = p2.copy()
                p7 = p3.copy()
                p4[2], p5[2], p6[2], p7[2] = z1, z1, z1, z1
                self._quad(p4, p7, p6, p5, color)
                self._quad(p0, p4, p5, p1, color)
                self._quad(p3, p2, p6, p7, color)

    def build(self) -> MeshData:
        if not self.positions:
            return MeshData(
                positions=np.zeros((0, 3), dtype=np.float32),
                normals=np.zeros((0, 3), dtype=np.float32),
                colors=np.zeros((0, 3), dtype=np.float32),
                indices=np.zeros((0,), dtype=np.uint32),
            )
        return MeshData(
            positions=np.stack(self.positions).astype(np.float32),
            normals=np.stack(self.normals).astype(np.float32),
            colors=np.stack(self.colors).astype(np.float32),
            indices=np.asarray(self.indices, dtype=np.uint32),
        )


# ---------------------------------------------------------------- reusable components
def add_steps(
    b: _Builder,
    x0: float,
    x1: float,
    z0: float,
    z1: float,
    start_y: float,
    *,
    steps: int,
    rise: float,
    color: tuple[float, ...] = SANDSTONE,
) -> None:
    run = (x1 - x0) / max(steps, 1)
    for i in range(steps):
        b.box(x0 + i * run, x0 + (i + 1) * run, start_y - (i + 1) * rise, start_y - i * rise, z0, z1, color)


def add_pillars(
    b: _Builder,
    xs: list[float],
    zs: list[float],
    y0: float,
    y1: float,
    *,
    radius: float = 0.24,
    color: tuple[float, ...] = SANDSTONE_LIGHT,
) -> None:
    for x in xs:
        for z in zs:
            b.cylinder(x, z, radius, y0, y1, color, segments=12)


def add_walls(
    b: _Builder,
    width: float,
    length: float,
    height: float,
    *,
    thickness: float = 0.5,
    y0: float = 0.0,
    color: tuple[float, ...] = SANDSTONE,
) -> None:
    b.box(-width / 2, width / 2, y0, y0 + height, length / 2 - thickness, length / 2, color)
    b.box(-width / 2, width / 2, y0, y0 + height, -length / 2, -length / 2 + thickness, color)
    b.box(-width / 2, -width / 2 + thickness, y0, y0 + height, -length / 2, length / 2, color)
    b.box(width / 2 - thickness, width / 2, y0, y0 + height, -length / 2, length / 2, color)


def add_windows(
    b: _Builder,
    xs: list[float],
    y0: float,
    y1: float,
    z: float,
    *,
    width: float = 0.9,
    color: tuple[float, ...] = DARK,
) -> None:
    for x in xs:
        b.box(x - width / 2, x + width / 2, y0, y1, z - 0.08, z + 0.08, color)


def add_carved_bands(
    b: _Builder,
    width: float,
    length: float,
    y0: float,
    y1: float,
    *,
    color: tuple[float, ...] = ACCENT,
) -> None:
    b.box(-width / 2 - 0.06, width / 2 + 0.06, y0, y1, length / 2, length / 2 + 0.12, color)
    b.box(-width / 2 - 0.06, width / 2 + 0.06, y0, y1, -length / 2 - 0.12, -length / 2, color)
    b.box(width / 2, width / 2 + 0.12, y0, y1, -length / 2, length / 2, color)
    b.box(-width / 2 - 0.12, -width / 2, y0, y1, -length / 2, length / 2, color)


# ---------------------------------------------------------------- typology templates
def _kund(b: _Builder, p: dict[str, Any]) -> None:
    width = float(p["width"])
    levels = max(1, int(p["levels"]))
    rise = float(p["step_rise"])
    terrace = min(float(p["terrace_depth"]), width / (levels * 2.2))
    for i in range(levels):
        outer = width - i * terrace
        inner = max(0.4, outer - terrace)
        y = -i * rise
        color = tuple(float(v) for v in np.clip(np.asarray(SANDSTONE) * (1.0 - 0.32 * i / levels), 0, 1))
        b.box(-outer, outer, y - 0.18, y, inner, outer, color)
        b.box(-outer, outer, y - 0.18, y, -outer, -inner, color)
        b.box(-outer, -inner, y - 0.18, y, -inner, inner, color)
        b.box(inner, outer, y - 0.18, y, -inner, inner, color)
        for z in (-inner, inner):
            b.box(-outer, outer, y - rise, y, z - 0.12, z + 0.12, color)
        for x in (-inner, inner):
            b.box(x - 0.12, x + 0.12, y - rise, y, -outer, outer, color)
    if p.get("water", True):
        water_y = -levels * rise + 0.06
        b.box(-width * 0.72, width * 0.72, water_y - 0.12, water_y, -width * 0.72, width * 0.72, WATER)
    apron = width * 1.32
    b.box(-apron, apron, -0.18, 0.0, width, apron, GROUND)
    b.box(-apron, apron, -0.18, 0.0, -apron, -width, GROUND)
    b.box(-apron, -width, -0.18, 0.0, -width, width, GROUND)
    b.box(width, apron, -0.18, 0.0, -width, width, GROUND)
    if p.get("parapet", True):
        for x0, x1, z0, z1 in (
            (-apron, apron, width, width + 0.35),
            (-apron, apron, -width - 0.35, -width),
            (-apron, -width - 0.35, -width, width),
            (width, apron, -width, width),
        ):
            b.box(x0, x1, 0.0, 0.95, z0, z1, SANDSTONE_LIGHT)
    if p.get("carved_bands", True):
        for i in range(3):
            y = -i * rise - 0.1
            b.box(-width - 0.08, width + 0.08, y, y + 0.16, width, width + 0.18, ACCENT)


def _vav(b: _Builder, p: dict[str, Any]) -> None:
    bays = max(1, int(p["bays"]))
    storeys = max(1, int(p["storeys"]))
    width = float(p["width"])
    bay = float(p["bay_length"])
    rise = float(p["rise_per_bay"])
    length = bays * bay
    b.box(-2.0, length + 5.0, -0.22, 0.0, -width / 2 - 4.0, -width / 2, GROUND)
    b.box(-2.0, length + 5.0, -0.22, 0.0, width / 2, width / 2 + 4.0, GROUND)
    for i in range(bays):
        x0 = i * bay
        y_floor = -i * rise
        color = tuple(float(v) for v in np.clip(np.asarray(SANDSTONE) * (1.0 - 0.22 * i / bays), 0, 1))
        add_steps(b, x0, x0 + bay, -width / 2, width / 2, y_floor, steps=8, rise=rise / 8, color=color)
        # side walls and carved bands
        for z in (-width / 2, width / 2):
            b.box(x0, x0 + bay, y_floor - rise, y_floor + 0.6, z - 0.35, z + 0.35, color)
            for band in range(3):
                y = y_floor - rise + 0.8 + band * 1.1
                b.box(x0 + 0.2, x0 + bay - 0.2, y, y + 0.22, z - 0.42, z + 0.42, ACCENT)
        # multi-storey pavilion: pillars, floor slabs and brackets
        levels = min(storeys, i + 1)
        for k in range(levels):
            ys = y_floor + k * rise
            if ys > 0.0:
                break
            add_pillars(
                b,
                [x0 + 0.7, x0 + bay - 0.7],
                [-width / 2 + 0.7, -0.9, 0.9, width / 2 - 0.7],
                ys,
                ys + rise - 0.3,
                color=SANDSTONE_LIGHT,
            )
            b.box(x0 + 0.25, x0 + bay - 0.25, ys + rise - 0.28, ys + rise - 0.05, -width / 2, width / 2, color)
            if p.get("ornament", True):
                b.arch(x0 + bay / 2, ys + rise - 0.4, -width / 2 + 0.1, -width / 2 + 0.55, bay * 0.28)
    if p.get("well", True):
        shaft_x = length + 2.8
        depth = bays * rise + 5.0
        b.cylinder(shaft_x, 0.0, width * 0.52, -depth, 0.25, SANDSTONE_DARK, segments=24)
        b.cylinder(shaft_x, 0.0, width * 0.42, -depth + 0.7, -depth + 0.8, WATER, segments=24)
        b.box(shaft_x - width * 0.8, shaft_x + width * 0.8, -0.2, 0.15, -width * 0.8, width * 0.8, GROUND)
    # entrance gateway
    b.box(-2.6, 0.2, 0.0, 3.8, -width / 2 - 0.6, -width / 2 + 0.1, SANDSTONE_LIGHT)
    b.box(-2.6, 0.2, 0.0, 3.8, width / 2 - 0.1, width / 2 + 0.6, SANDSTONE_LIGHT)
    b.box(-2.6, 0.2, 3.2, 4.0, -width / 2 - 0.6, width / 2 + 0.6, SANDSTONE_LIGHT)
    b.arch(-1.2, 0.0, -width / 2 - 0.65, width / 2 + 0.65, 1.5, SANDSTONE_DARK, segments=10)


def _temple(b: _Builder, p: dict[str, Any]) -> None:
    width = float(p["width"])
    length = float(p["length"])
    height = float(p["height"])
    plinth = float(p["plinth_height"])
    b.box(-width / 2, width / 2, -0.2, plinth, -length / 2, length / 2, GROUND)
    if p.get("steps", True):
        add_steps(b, -width * 0.22, width * 0.22, -length / 2 - 2.2, -length / 2, plinth, steps=5, rise=plinth / 5)
    # sanctum + mandapa
    b.box(-width * 0.28, width * 0.28, plinth, plinth + height * 0.72, -length * 0.42, -length * 0.08, SANDSTONE)
    b.box(-width * 0.36, width * 0.36, plinth, plinth + height * 0.55, -length * 0.06, length * 0.42, SANDSTONE_LIGHT)
    if p.get("pillars", True):
        xs = [-width * 0.30, -width * 0.10, width * 0.10, width * 0.30]
        add_pillars(b, xs, [-length * 0.02, length * 0.18, length * 0.38], plinth, plinth + height * 0.48)
    b.box(-width * 0.40, width * 0.40, plinth + height * 0.55, plinth + height * 0.63, -length * 0.08, length * 0.44, SANDSTONE)
    # stepped shikhara
    for i in range(6):
        shrink = 1.0 - i * 0.14
        b.box(
            -width * 0.26 * shrink,
            width * 0.26 * shrink,
            plinth + height * 0.72 + i * height * 0.045,
            plinth + height * 0.72 + (i + 1) * height * 0.045,
            -length * 0.34,
            -length * 0.16,
            SANDSTONE_LIGHT,
        )
    if p.get("dome", True):
        b.dome(0.0, -length * 0.25, width * 0.16, plinth + height * 0.98, SANDSTONE_LIGHT)
    if p.get("ornament", True):
        add_carved_bands(b, width * 0.72, length * 0.72, plinth + height * 0.22, plinth + height * 0.28)
        add_windows(b, [-width * 0.20, width * 0.20], plinth + height * 0.20, plinth + height * 0.38, length * 0.43)


def _mosque(b: _Builder, p: dict[str, Any]) -> None:
    width = float(p["width"])
    length = float(p["length"])
    height = float(p["height"])
    b.box(-width / 2, width / 2, -0.2, 0.7, -length / 2, length / 2, GROUND)
    if p.get("steps", True):
        add_steps(b, -width * 0.18, width * 0.18, -length / 2 - 2.5, -length / 2, 0.7, steps=4, rise=0.18)
    b.box(-width * 0.44, width * 0.44, 0.7, 0.7 + height * 0.68, -length * 0.42, length * 0.26, SANDSTONE)
    bays = max(1, int(p["arcade_bays"]))
    for i in range(bays):
        x = -width * 0.38 + i * (width * 0.76 / max(bays - 1, 1))
        b.cylinder(x, length * 0.30, 0.32, 0.7, 0.7 + height * 0.55, SANDSTONE_LIGHT, segments=12)
        if i < bays - 1:
            b.arch(x + width * 0.38 / max(bays - 1, 1), 0.7 + height * 0.36, length * 0.24, length * 0.34, width * 0.38 / max(bays - 1, 1) * 0.8)
    b.box(-width * 0.46, width * 0.46, 0.7 + height * 0.55, 0.7 + height * 0.66, -length * 0.44, length * 0.36, SANDSTONE_LIGHT)
    domes = max(1, int(p["domes"]))
    for i in range(domes):
        cx = 0.0 if domes == 1 else -width * 0.22 + i * width * 0.44 / max(domes - 1, 1)
        b.dome(cx, -length * 0.08, width * 0.20, 0.7 + height * 0.66, SANDSTONE_LIGHT)
    for i in range(max(0, int(p["minarets"]))):
        x = -width * 0.48 if i % 2 == 0 else width * 0.48
        z = length * 0.34 if i < 2 else -length * 0.38
        b.cylinder(x, z, 0.55, 0.0, height * 1.35, SANDSTONE_LIGHT, segments=16)
        b.dome(x, z, 0.62, height * 1.35, SANDSTONE_DARK, segments=12, rings=5)
    if p.get("ornament", True):
        add_carved_bands(b, width * 0.88, length * 0.68, 0.7 + height * 0.28, 0.7 + height * 0.34)


def _fort(b: _Builder, p: dict[str, Any]) -> None:
    width = float(p["width"])
    length = float(p["length"])
    wall = float(p["wall_height"])
    thickness = float(p["wall_thickness"])
    b.box(-width / 2, width / 2, -0.2, 0.0, -length / 2, length / 2, GROUND)
    add_walls(b, width, length, wall, thickness=thickness, color=SANDSTONE)
    if p.get("battlements", True):
        count = 12
        for i in range(count):
            x = -width / 2 + i * width / count
            b.box(x, x + width / count * 0.55, wall, wall + 0.9, length / 2 - thickness, length / 2, SANDSTONE_LIGHT)
            b.box(x, x + width / count * 0.55, wall, wall + 0.9, -length / 2, -length / 2 + thickness, SANDSTONE_LIGHT)
    for i in range(max(0, int(p["bastions"]))):
        x = -width / 2 if i % 2 == 0 else width / 2
        z = -length / 2 if i < 2 else length / 2
        b.cylinder(x, z, thickness * 1.6, 0.0, wall + 1.4, SANDSTONE_DARK, segments=18)
        b.dome(x, z, thickness * 1.65, wall + 1.4, SANDSTONE_DARK, segments=14, rings=5)
    if p.get("gate", True):
        b.box(-width * 0.16, width * 0.16, 0.0, wall * 0.85, length / 2 - thickness - 0.1, length / 2 + 0.8, SANDSTONE_LIGHT)
        b.arch(0.0, 0.0, length / 2 + 0.82, length / 2 + 0.9, width * 0.10, SANDSTONE_DARK, segments=10)
    # simple internal courtyard platforms
    b.box(-width * 0.18, width * 0.18, 0.0, 1.1, -length * 0.16, length * 0.16, SANDSTONE_LIGHT)


def _palace(b: _Builder, p: dict[str, Any]) -> None:
    width = float(p["width"])
    length = float(p["length"])
    height = float(p["height"])
    storeys = max(1, int(p["storeys"]))
    b.box(-width / 2, width / 2, -0.2, 0.8, -length / 2, length / 2, GROUND)
    add_walls(b, width, length, height * 0.72, thickness=0.7, y0=0.8, color=SANDSTONE)
    if p.get("courtyard", True):
        b.box(-width * 0.22, width * 0.22, 0.8, 0.85, -length * 0.18, length * 0.18, WATER)
        add_pillars(
            b,
            [-width * 0.28, -width * 0.10, width * 0.10, width * 0.28],
            [-length * 0.22, length * 0.22],
            0.8,
            0.8 + height * 0.52,
        )
    for storey in range(storeys):
        y = 0.8 + storey * height * 0.34
        b.box(-width * 0.46, width * 0.46, y + height * 0.26, y + height * 0.32, -length * 0.46, length * 0.46, SANDSTONE_LIGHT)
        add_windows(
            b,
            [-width * 0.32, -width * 0.16, 0.0, width * 0.16, width * 0.32],
            y + height * 0.08,
            y + height * 0.22,
            length * 0.46,
        )
    if p.get("dome", True):
        b.dome(0.0, 0.0, width * 0.18, 0.8 + storeys * height * 0.34, SANDSTONE_LIGHT)
    if p.get("ornament", True):
        add_carved_bands(b, width, length, 0.8 + height * 0.16, 0.8 + height * 0.21)


def _generic(b: _Builder, p: dict[str, Any]) -> None:
    width = float(p["width"])
    length = float(p["length"])
    height = float(p["height"])
    plinth = float(p["plinth_height"])
    b.box(-width / 2, width / 2, -0.2, plinth, -length / 2, length / 2, GROUND)
    if p.get("steps", True):
        add_steps(b, -width * 0.20, width * 0.20, -length / 2 - 2.0, -length / 2, plinth, steps=4, rise=plinth / 4)
    b.box(-width * 0.38, width * 0.38, plinth, plinth + height * 0.62, -length * 0.38, length * 0.38, SANDSTONE)
    if p.get("pillars", True):
        add_pillars(b, [-width * 0.28, width * 0.28], [-length * 0.26, length * 0.26], plinth, plinth + height * 0.5)
    b.box(-width * 0.44, width * 0.44, plinth + height * 0.62, plinth + height * 0.70, -length * 0.44, length * 0.44, SANDSTONE_LIGHT)
    if p.get("dome", False):
        b.dome(0.0, 0.0, width * 0.18, plinth + height * 0.70, SANDSTONE_LIGHT)
    if p.get("ornament", True):
        add_windows(b, [-width * 0.22, 0.0, width * 0.22], plinth + height * 0.18, plinth + height * 0.36, length * 0.39)
        add_carved_bands(b, width * 0.76, length * 0.76, plinth + height * 0.40, plinth + height * 0.45)


TEMPLATES = {
    "kund": _kund,
    "vav": _vav,
    "temple": _temple,
    "mosque": _mosque,
    "fort": _fort,
    "palace": _palace,
    "generic": _generic,
}


# ---------------------------------------------------------------- configuration
@lru_cache(maxsize=1)
def load_profiles() -> dict[str, Any]:
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def profile_for_site(site: SiteLike) -> dict[str, Any]:
    """Resolve site-specific configuration, falling back to its category typology.

    This is the only place that maps a site to data.  Unknown sites, missing dimensions and
    uncertain typologies all degrade to a documented generic template instead of failing.
    """
    config = load_profiles()
    typologies = config["typologies"]
    override = config.get("sites", {}).get(site.slug, {})
    typology = override.get("typology") or config["category_typology"].get(site.category, "generic")
    if typology not in typologies:
        typology = "generic"
    spec = typologies[typology]
    params = {**spec["defaults"], **override.get("params", {})}
    return {
        "typology": typology,
        "label": spec["label"],
        "params": params,
        "required": list(spec["required"]),
        "optional": list(spec["optional"]),
        "estimated": list(spec["estimated"]),
        "note": override.get("note"),
        "source": override.get("source", "category default / estimated"),
        "disclaimer": config["disclaimer"],
    }


def build_procedural_mesh(profile: dict[str, Any]) -> MeshData:
    """Build a mesh from a resolved profile.  Pure, deterministic and site-agnostic."""
    typology = str(profile["typology"])
    template = TEMPLATES.get(typology, _generic)
    builder = _Builder()
    template(builder, dict(profile["params"]))
    mesh = builder.build()
    # Centre on the ground plane so the viewer's camera fit is stable for every typology.
    if mesh.vertex_count:
        centre_x = float((mesh.positions[:, 0].min() + mesh.positions[:, 0].max()) / 2.0)
        centre_z = float((mesh.positions[:, 2].min() + mesh.positions[:, 2].max()) / 2.0)
        mesh.positions[:, 0] -= centre_x
        mesh.positions[:, 2] -= centre_z
    return mesh


def mesh_to_glb(mesh: MeshData, *, name: str = "Procedural typology model") -> bytes:
    """Write a minimal glTF 2.0 binary with positions, normals, vertex colours and indices."""
    positions = np.ascontiguousarray(mesh.positions, dtype=np.float32)
    normals = np.ascontiguousarray(mesh.normals, dtype=np.float32)
    colors = np.ascontiguousarray(np.clip(mesh.colors, 0.0, 1.0), dtype=np.float32)
    indices = np.ascontiguousarray(mesh.indices, dtype=np.uint32)

    def view(data: bytes, target: int | None = None) -> dict[str, Any]:
        out: dict[str, Any] = {"buffer": 0, "byteOffset": current["offset"], "byteLength": len(data)}
        if target is not None:
            out["target"] = target
        current["offset"] += len(data)
        return out

    current = {"offset": 0}
    views = [
        view(positions.tobytes(), 34962),
        view(normals.tobytes(), 34962),
        view(colors.tobytes(), 34962),
        view(indices.tobytes(), 34963),
    ]
    binary = b"".join((positions.tobytes(), normals.tobytes(), colors.tobytes(), indices.tobytes()))
    accessors = [
        {
            "bufferView": 0,
            "componentType": 5126,
            "count": int(positions.shape[0]),
            "type": "VEC3",
            "min": positions.min(axis=0).tolist() if positions.size else [0, 0, 0],
            "max": positions.max(axis=0).tolist() if positions.size else [0, 0, 0],
        },
        {"bufferView": 1, "componentType": 5126, "count": int(normals.shape[0]), "type": "VEC3"},
        {"bufferView": 2, "componentType": 5126, "count": int(colors.shape[0]), "type": "VEC3"},
        {"bufferView": 3, "componentType": 5125, "count": int(indices.shape[0]), "type": "SCALAR"},
    ]
    document = {
        "asset": {"version": "2.0", "generator": "HeritageLens procedural architecture engine"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": name}],
        "meshes": [
            {
                "name": name,
                "primitives": [
                    {
                        "attributes": {"POSITION": 0, "NORMAL": 1, "COLOR_0": 2},
                        "indices": 3,
                        "material": 0,
                        "mode": 4,
                    }
                ],
            }
        ],
        "materials": [
            {
                "name": "Sandstone vertex colours",
                "pbrMetallicRoughness": {
                    "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.88,
                },
                "doubleSided": True,
            }
        ],
        "bufferViews": views,
        "accessors": accessors,
        "buffers": [{"byteLength": len(binary)}],
    }
    json_chunk = json.dumps(document, separators=(",", ":")).encode("utf-8")
    json_chunk += b" " * ((4 - len(json_chunk) % 4) % 4)
    binary += b"\x00" * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(json_chunk) + 8 + len(binary)
    return (
        struct.pack("<4sII", b"glTF", 2, total)
        + struct.pack("<II", len(json_chunk), 0x4E4F534A)
        + json_chunk
        + struct.pack("<II", len(binary), 0x004E4942)
        + binary
    )


def _profile_meta(
    profile: dict[str, Any], digest: str, *, vertices: int, triangles: int
) -> dict[str, Any]:
    """Metadata shared by the point-cloud and mesh procedural twins."""
    return {
        "kind": "procedural",
        "approximate": True,
        "disclaimer": profile["disclaimer"],
        "typology": profile["typology"],
        "label": profile["label"],
        "parameters": profile["params"],
        "required": profile["required"],
        "optional": profile["optional"],
        "estimated": profile["estimated"],
        "note": profile["note"],
        "source": profile["source"],
        "config_hash": digest,
        "vertices": vertices,
        "triangles": triangles,
    }


def _profile_digest(profile: dict[str, Any], artifact: bytes) -> str:
    return hashlib.sha256(
        json.dumps(profile, sort_keys=True, default=str).encode("utf-8") + artifact
    ).hexdigest()[:16]


def _default_seed(profile: dict[str, Any]) -> int:
    """Stable seed for sites whose profile does not pin one."""
    digest = hashlib.sha256(json.dumps(profile, sort_keys=True, default=str).encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 2_147_483_647


def procedural_point_cloud(profile: dict[str, Any]) -> tuple[PointCloud, bytes] | None:
    """Reference-compatible parametric point cloud for the two stepwell typologies.

    This is the exact method used by the original HeritageLens demo: a deterministic point cloud
    written as a binary PLY and rendered by three.js ``PLYLoader``.  Other typologies keep the
    mesh renderer, because the reference builders only describe stepwells.
    """
    typology = str(profile["typology"])
    params = profile["params"]
    seed = int(params.get("seed", 0)) or _default_seed(profile)
    if typology == "kund":
        cloud = kund_stepwell(levels=int(params["levels"]), top=float(params["width"]), seed=seed)
    elif typology == "vav":
        cloud = vav_stepwell(pavilions=int(params["bays"]), seed=seed)
    else:
        return None
    return cloud, write_ply(cloud, "HeritageLens procedural model")


def procedural_artifact(site: SiteLike) -> tuple[bytes, dict[str, Any]]:
    """Return (GLB bytes, metadata) for a site.  Same inputs always produce the same bytes."""
    profile = profile_for_site(site)
    mesh = build_procedural_mesh(profile)
    glb = mesh_to_glb(mesh, name=f"{profile['typology']} - procedural typology")
    meta = _profile_meta(
        profile,
        _profile_digest(profile, glb),
        vertices=mesh.vertex_count,
        triangles=mesh.triangle_count,
    )
    return glb, meta


async def ensure_procedural_mesh_twin(
    session: Any, storage: Any, site: SiteLike, site_id: int
) -> tuple[Any, bool]:
    """Return (site's procedural GLB mesh twin, created_now).

    The mesh twin is the wireframe source.  It is separate from the displayed point cloud so the
    viewer can draw real triangle edges without changing the procedural model's appearance.
    """
    from sqlalchemy import select

    from app.db.models import Twin

    existing = await session.scalar(
        select(Twin)
        .where(Twin.site_id == site_id, Twin.method == "procedural", Twin.format == "glb")
        .order_by(Twin.id.desc())
        .limit(1)
    )
    if existing is not None and await storage.exists(existing.storage_key):
        return existing, False
    glb, meta = procedural_artifact(site)
    key = f"twins/site-{site_id}/procedural/{site.slug}-{meta['config_hash']}.glb"
    await storage.put(key, glb, "model/gltf-binary")
    twin = Twin(
        site_id=site_id,
        title=f"{site.name} - procedural typology model",
        method="procedural",
        format="glb",
        storage_key=key,
        point_count=meta["vertices"],
        meta=meta,
    )
    session.add(twin)
    await session.flush()
    return twin, True


async def ensure_procedural_twin(session: Any, storage: Any, site: SiteLike, site_id: int) -> tuple[Any, bool]:
    """Return the procedural model shown to visitors.

    Stepwell typologies use the original HeritageLens point-cloud method (``.ply``); every other
    typology falls back to the vertex-coloured GLB mesh.  Existing seeded point clouds are reused
    as-is, so an already-populated archive keeps its exact models.
    """
    from sqlalchemy import select

    from app.db.models import Twin

    existing = await session.scalar(
        select(Twin)
        .where(Twin.site_id == site_id, Twin.method == "procedural", Twin.format == "ply")
        .order_by(Twin.id.desc())
        .limit(1)
    )
    if existing is not None and await storage.exists(existing.storage_key):
        # Older reference seeds only stored a demo note; backfill the metadata the mode panel
        # needs without touching the model file itself.
        if not (existing.meta or {}).get("parameters"):
            profile = profile_for_site(site)
            meta = _profile_meta(
                profile,
                _profile_digest(profile, existing.storage_key.encode("utf-8")),
                vertices=int(existing.point_count or 0),
                triangles=0,
            )
            existing.meta = {**(existing.meta or {}), **meta}
            await session.flush()
        return existing, False

    profile = profile_for_site(site)
    artifact = procedural_point_cloud(profile)
    if artifact is not None:
        cloud, ply = artifact
        meta = _profile_meta(
            profile,
            _profile_digest(profile, ply),
            vertices=len(cloud),
            triangles=0,
        )
        key = f"twins/site-{site_id}/procedural/{site.slug}-{meta['config_hash']}.ply"
        await storage.put(key, ply, "application/ply")
        twin = Twin(
            site_id=site_id,
            title=f"{site.name} - procedural typology model",
            method="procedural",
            format="ply",
            storage_key=key,
            point_count=len(cloud),
            meta=meta,
        )
        session.add(twin)
        await session.flush()
        return twin, True

    return await ensure_procedural_mesh_twin(session, storage, site, site_id)
