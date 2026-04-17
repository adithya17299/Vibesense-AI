/* ── VibraSense AI Landing Page — Three.js + Interactions ── */

let scene, camera, renderer, models = [];
let mouseX = 0, mouseY = 0;
let clock;
let energyPulses = [];

function initScene() {
    const canvas = document.getElementById('three-canvas');
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080810, 0.008);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 4, 20);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x080810);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    clock = new THREE.Clock();

    // Lights — cinematic setup
    const ambientLight = new THREE.AmbientLight(0x1a1a2e, 0.8);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0x4488ff, 0.4);
    mainLight.position.set(-8, 12, 8);
    mainLight.castShadow = true;
    scene.add(mainLight);

    const accentLight1 = new THREE.PointLight(0x00ffc8, 3, 60);
    accentLight1.position.set(-10, 8, 8);
    scene.add(accentLight1);

    const accentLight2 = new THREE.PointLight(0x00aaff, 2.5, 55);
    accentLight2.position.set(10, 6, 6);
    scene.add(accentLight2);

    const warmLight = new THREE.PointLight(0xff6622, 2, 50);
    warmLight.position.set(2, 10, -5);
    scene.add(warmLight);

    const rimLight = new THREE.PointLight(0x8844ff, 1.5, 40);
    rimLight.position.set(0, -3, 10);
    scene.add(rimLight);

    const fillLight = new THREE.PointLight(0xff3388, 1, 35);
    fillLight.position.set(-4, -2, 6);
    scene.add(fillLight);

    // Scene elements
    createGridFloor();
    createSuspensionBridge(-7, -0.5, 0.5);
    createTowerCrane(7, 0.5, -0.5);
    createHighRise(-2, 0.2, -2);
    createRadioTower(3, 0.2, -1.5);
    createParticles();
    createEnergyRings();

    animate();
}

/* ──────────────────────────────────────────────────────
   SHARED MATERIALS
   ────────────────────────────────────────────────────── */

function solidMat(color, opacity = 0.85) {
    return new THREE.MeshStandardMaterial({
        color,
        metalness: 0.7,
        roughness: 0.3,
        transparent: opacity < 1,
        opacity,
        side: THREE.DoubleSide,
    });
}

function glassMat(color, opacity = 0.15) {
    return new THREE.MeshStandardMaterial({
        color,
        metalness: 0.9,
        roughness: 0.1,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
    });
}

function edgeMat(color) {
    return new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
}

function glowMat(color, opacity = 0.9) {
    return new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
    });
}

// Add edge glow to a mesh
function addEdges(group, geometry, color, opacity = 0.5) {
    const edges = new THREE.EdgesGeometry(geometry, 15);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const lines = new THREE.LineSegments(edges, mat);
    group.add(lines);
    return lines;
}

// Create a labeled sensor dot
function addSensorDot(group, x, y, z, color, size = 0.08) {
    // Outer glow ring
    const ringGeo = new THREE.RingGeometry(size * 1.8, size * 2.2, 16);
    const ring = new THREE.Mesh(ringGeo, glowMat(color, 0.3));
    ring.position.set(x, y, z);
    ring.lookAt(camera ? camera.position : new THREE.Vector3(0, 3, 14));
    group.add(ring);

    // Inner solid dot
    const dotGeo = new THREE.SphereGeometry(size, 12, 12);
    const dot = new THREE.Mesh(dotGeo, glowMat(color, 0.95));
    dot.position.set(x, y, z);
    group.add(dot);

    return dot;
}

// Tubular beam
function addBeam(group, from, to, radius, color, opacity = 0.85) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(radius, radius, len, 6);
    const mesh = new THREE.Mesh(geo, solidMat(color, opacity));
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.lookAt(to);
    mesh.rotateX(Math.PI / 2);
    group.add(mesh);
    return mesh;
}

/* ──────────────────────────────────────────────────────
   GRID FLOOR
   ────────────────────────────────────────────────────── */

function createGridFloor() {
    const gridSize = 50;
    const divisions = 50;
    const gridHelper = new THREE.GridHelper(gridSize, divisions, 0x1a2a3a, 0x0d1520);
    gridHelper.position.y = -4;
    gridHelper.material.opacity = 0.5;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    // Secondary finer grid
    const gridHelper2 = new THREE.GridHelper(50, 200, 0x0a1520, 0x060d14);
    gridHelper2.position.y = -4.005;
    gridHelper2.material.opacity = 0.2;
    gridHelper2.material.transparent = true;
    scene.add(gridHelper2);

    // Plane with subtle gradient
    const planeGeo = new THREE.PlaneGeometry(80, 80);
    const planeMat = new THREE.MeshBasicMaterial({
        color: 0x080810,
        transparent: true,
        opacity: 0.9
    });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -4.02;
    scene.add(plane);
}

/* ──────────────────────────────────────────────────────
   SUSPENSION BRIDGE — Detailed, solid, realistic
   ────────────────────────────────────────────────────── */

function createSuspensionBridge(x, y, z) {
    const group = new THREE.Group();
    const TEAL = 0x00ffc8;
    const DECK_W = 7;
    const DECK_D = 1.6;

    // ── Main deck (solid slab)
    const deckGeo = new THREE.BoxGeometry(DECK_W, 0.18, DECK_D);
    const deck = new THREE.Mesh(deckGeo, solidMat(TEAL, 0.6));
    deck.position.y = 0;
    group.add(deck);
    addEdges(group, deckGeo, TEAL, 0.8).position.copy(deck.position);

    // ── Road surface markings
    const roadGeo = new THREE.BoxGeometry(DECK_W - 0.2, 0.19, 0.04);
    const road = new THREE.Mesh(roadGeo, glowMat(TEAL, 0.2));
    road.position.y = 0;
    group.add(road);

    // Dashed center line
    for (let lx = -3; lx <= 3; lx += 0.6) {
        const dashGeo = new THREE.BoxGeometry(0.25, 0.19, 0.02);
        const dash = new THREE.Mesh(dashGeo, glowMat(TEAL, 0.4));
        dash.position.set(lx, 0, 0);
        group.add(dash);
    }

    // ── Guard rails
    for (let side of [-DECK_D / 2 + 0.05, DECK_D / 2 - 0.05]) {
        // Rail posts
        for (let rx = -3.2; rx <= 3.2; rx += 0.4) {
            const postGeo = new THREE.BoxGeometry(0.03, 0.3, 0.03);
            const post = new THREE.Mesh(postGeo, solidMat(TEAL, 0.5));
            post.position.set(rx, 0.24, side);
            group.add(post);
        }
        // Rail top bar
        const barGeo = new THREE.BoxGeometry(DECK_W, 0.02, 0.02);
        const bar = new THREE.Mesh(barGeo, solidMat(TEAL, 0.7));
        bar.position.set(0, 0.4, side);
        group.add(bar);
    }

    // ── Towers (A-frame pylons)
    for (let tx of [-2.2, 2.2]) {
        const towerH = 3.8;
        // Main columns
        for (let tz of [-0.35, 0.35]) {
            const colGeo = new THREE.BoxGeometry(0.18, towerH, 0.18);
            const col = new THREE.Mesh(colGeo, solidMat(TEAL, 0.75));
            col.position.set(tx, towerH / 2, tz);
            group.add(col);
            addEdges(group, colGeo, TEAL, 0.6).position.copy(col.position);
        }

        // Cross beams on tower
        for (let by = 0.8; by < towerH; by += 0.9) {
            const crossGeo = new THREE.BoxGeometry(0.06, 0.06, 0.64);
            const cross = new THREE.Mesh(crossGeo, solidMat(TEAL, 0.5));
            cross.position.set(tx, by, 0);
            group.add(cross);
        }

        // Tower cap
        const capGeo = new THREE.BoxGeometry(0.35, 0.12, 0.85);
        const cap = new THREE.Mesh(capGeo, solidMat(TEAL, 0.8));
        cap.position.set(tx, towerH + 0.06, 0);
        group.add(cap);
        addEdges(group, capGeo, TEAL, 0.7).position.copy(cap.position);

        // Saddle piece
        const saddleGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.9, 8);
        const saddle = new THREE.Mesh(saddleGeo, solidMat(TEAL, 0.6));
        saddle.position.set(tx, towerH + 0.18, 0);
        saddle.rotation.x = Math.PI / 2;
        group.add(saddle);
    }

    // ── Main cables (thick catenary)
    for (let side of [-0.4, 0.4]) {
        const cablePoints = [];
        for (let i = -3.5; i <= 3.5; i += 0.15) {
            const sag = Math.pow(i / 3.5, 2) * 2.0;
            cablePoints.push(new THREE.Vector3(i, 3.85 - sag, side));
        }
        const cableCurve = new THREE.CatmullRomCurve3(cablePoints);
        const tubeGeo = new THREE.TubeGeometry(cableCurve, 60, 0.035, 8, false);
        const cable = new THREE.Mesh(tubeGeo, solidMat(TEAL, 0.8));
        group.add(cable);
    }

    // ── Suspender cables (vertical hangers)
    for (let sx = -3.0; sx <= 3.0; sx += 0.35) {
        const sag = Math.pow(sx / 3.5, 2) * 2.0;
        const top = 3.85 - sag;
        for (let sz of [-0.4, 0.4]) {
            if (top > 0.25) {
                const hangerGeo = new THREE.CylinderGeometry(0.012, 0.012, top - 0.1, 4);
                const hanger = new THREE.Mesh(hangerGeo, solidMat(TEAL, 0.35));
                hanger.position.set(sx, (top + 0.1) / 2, sz);
                group.add(hanger);
            }
        }
    }

    // ── Under-deck truss structure
    for (let ux = -3; ux < 3; ux += 0.9) {
        // Diagonal bracing
        for (let uz of [-DECK_D / 2 + 0.1, DECK_D / 2 - 0.1]) {
            const diagGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.1, 4);
            const diag = new THREE.Mesh(diagGeo, solidMat(TEAL, 0.25));
            diag.position.set(ux + 0.45, -0.35, uz);
            diag.rotation.z = Math.PI / 4;
            group.add(diag);
        }
        // Horizontal struts
        const strutGeo = new THREE.BoxGeometry(0.9, 0.04, 0.04);
        const strut = new THREE.Mesh(strutGeo, solidMat(TEAL, 0.3));
        strut.position.set(ux + 0.45, -0.5, 0);
        group.add(strut);
    }

    // ── Abutments (end anchors)
    for (let ax of [-DECK_W / 2 + 0.3, DECK_W / 2 - 0.3]) {
        const abutGeo = new THREE.BoxGeometry(0.6, 0.6, DECK_D + 0.2);
        const abut = new THREE.Mesh(abutGeo, solidMat(TEAL, 0.4));
        abut.position.set(ax, -0.3, 0);
        group.add(abut);
        addEdges(group, abutGeo, TEAL, 0.3).position.copy(abut.position);
    }

    // ── Sensor dots
    addSensorDot(group, -2.2, 0, 0, TEAL, 0.07);
    addSensorDot(group, 2.2, 0, 0, TEAL, 0.07);
    addSensorDot(group, 0, 0, 0, TEAL, 0.1); // midspan
    addSensorDot(group, -2.2, 3.86, 0, TEAL, 0.06);
    addSensorDot(group, 2.2, 3.86, 0, TEAL, 0.06);
    for (let sx = -2; sx <= 2; sx += 1) {
        addSensorDot(group, sx, -0.1, 0, 0x00ffaa, 0.04);
    }

    group.position.set(x, y, z);
    group.scale.set(1.15, 1.15, 1.15);
    models.push(group);
    scene.add(group);
}

/* ──────────────────────────────────────────────────────
   TOWER CRANE — Detailed, solid, realistic
   ────────────────────────────────────────────────────── */

function createTowerCrane(x, y, z) {
    const group = new THREE.Group();
    const BLUE = 0x00aaff;
    const YELLOW = 0xffcc00;

    // ── Base platform
    const baseGeo = new THREE.BoxGeometry(1.2, 0.15, 1.2);
    const base = new THREE.Mesh(baseGeo, solidMat(BLUE, 0.7));
    base.position.y = 0;
    group.add(base);
    addEdges(group, baseGeo, BLUE, 0.6).position.copy(base.position);

    // Base ballast blocks
    for (let bx of [-0.4, 0.4]) {
        for (let bz of [-0.4, 0.4]) {
            const ballastGeo = new THREE.BoxGeometry(0.3, 0.2, 0.3);
            const ballast = new THREE.Mesh(ballastGeo, solidMat(0x334466, 0.6));
            ballast.position.set(bx, -0.1, bz);
            group.add(ballast);
        }
    }

    // ── Mast (lattice tower) — 4 corner columns + cross bracing
    const mastH = 6;
    const mastW = 0.55;
    const mastCorners = [
        [-mastW / 2, -mastW / 2], [mastW / 2, -mastW / 2],
        [mastW / 2, mastW / 2], [-mastW / 2, mastW / 2]
    ];

    // Corner columns
    for (let [cx, cz] of mastCorners) {
        const colGeo = new THREE.BoxGeometry(0.08, mastH, 0.08);
        const col = new THREE.Mesh(colGeo, solidMat(BLUE, 0.75));
        col.position.set(cx, mastH / 2 + 0.1, cz);
        group.add(col);
    }

    // Cross bracing — X patterns every segment
    for (let by = 0.4; by < mastH; by += 0.7) {
        // All four faces
        const faces = [
            [[-mastW / 2, -mastW / 2], [mastW / 2, -mastW / 2]],
            [[mastW / 2, -mastW / 2], [mastW / 2, mastW / 2]],
            [[mastW / 2, mastW / 2], [-mastW / 2, mastW / 2]],
            [[-mastW / 2, mastW / 2], [-mastW / 2, -mastW / 2]],
        ];
        for (let [[x1, z1], [x2, z2]] of faces) {
            // Diagonal 1
            const p1 = [new THREE.Vector3(x1, by, z1), new THREE.Vector3(x2, by + 0.7, z2)];
            const g1 = new THREE.BufferGeometry().setFromPoints(p1);
            group.add(new THREE.Line(g1, edgeMat(BLUE)));
            // Diagonal 2
            const p2 = [new THREE.Vector3(x2, by, z2), new THREE.Vector3(x1, by + 0.7, z1)];
            const g2 = new THREE.BufferGeometry().setFromPoints(p2);
            group.add(new THREE.Line(g2, edgeMat(BLUE)));
        }
        // Horizontal ring
        const ringPts = [...mastCorners.map(([cx, cz]) => new THREE.Vector3(cx, by, cz)), new THREE.Vector3(mastCorners[0][0], by, mastCorners[0][1])];
        const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
        group.add(new THREE.Line(ringGeo, edgeMat(BLUE)));
    }

    // ── Slewing unit (turntable)
    const slewGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.15, 16);
    const slew = new THREE.Mesh(slewGeo, solidMat(BLUE, 0.8));
    slew.position.y = mastH + 0.18;
    group.add(slew);
    addEdges(group, slewGeo, BLUE, 0.6).position.copy(slew.position);

    // ── A-frame (cat-head)
    const aFrameH = 1.2;
    for (let side of [-0.15, 0.15]) {
        const legGeo = new THREE.CylinderGeometry(0.03, 0.05, aFrameH, 6);
        const leg = new THREE.Mesh(legGeo, solidMat(BLUE, 0.8));
        leg.position.set(side, mastH + 0.25 + aFrameH / 2, 0);
        group.add(leg);
    }
    // Top cross
    const aTopGeo = new THREE.BoxGeometry(0.4, 0.06, 0.06);
    const aTop = new THREE.Mesh(aTopGeo, solidMat(BLUE, 0.8));
    aTop.position.set(0, mastH + 0.25 + aFrameH, 0);
    group.add(aTop);

    // ── Jib arm (working arm) — lattice style
    const jibLen = 5;
    const jibH = 0.25;
    // Top and bottom chords
    for (let jy of [0, jibH]) {
        const chordGeo = new THREE.BoxGeometry(jibLen, 0.04, 0.04);
        const chord = new THREE.Mesh(chordGeo, solidMat(BLUE, 0.7));
        chord.position.set(jibLen / 2 - 0.3, mastH + 0.3 + jy, 0);
        group.add(chord);
    }
    // Jib lattice verticals + diagonals
    for (let jx = 0; jx < jibLen; jx += 0.4) {
        const px = jx - 0.3;
        // Vertical
        const vPts = [new THREE.Vector3(px, mastH + 0.3, 0), new THREE.Vector3(px, mastH + 0.3 + jibH, 0)];
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(vPts), edgeMat(BLUE)));
        // Diagonal
        const dPts = [new THREE.Vector3(px, mastH + 0.3, 0), new THREE.Vector3(px + 0.4, mastH + 0.3 + jibH, 0)];
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(dPts), edgeMat(BLUE)));
    }

    // ── Counter-jib arm
    const cjibLen = 2;
    const cjibGeo = new THREE.BoxGeometry(cjibLen, 0.12, 0.12);
    const cjib = new THREE.Mesh(cjibGeo, solidMat(BLUE, 0.7));
    cjib.position.set(-cjibLen / 2 - 0.1, mastH + 0.35, 0);
    group.add(cjib);
    addEdges(group, cjibGeo, BLUE, 0.5).position.copy(cjib.position);

    // Counter-weight
    for (let cwi = 0; cwi < 3; cwi++) {
        const cwGeo = new THREE.BoxGeometry(0.35, 0.25, 0.35);
        const cw = new THREE.Mesh(cwGeo, solidMat(0x445566, 0.6));
        cw.position.set(-cjibLen + 0.2 + cwi * 0.38, mastH + 0.12, 0);
        group.add(cw);
        addEdges(group, cwGeo, 0x667788, 0.3).position.copy(cw.position);
    }

    // ── Support cables — from A-frame to jib tip and counter-jib
    const cableTop = new THREE.Vector3(0, mastH + 0.25 + aFrameH, 0);
    const jibTip = new THREE.Vector3(jibLen - 0.3, mastH + 0.55, 0);
    const cjibTip = new THREE.Vector3(-cjibLen - 0.1, mastH + 0.4, 0);

    // Jib cables
    const jibCableCurve = new THREE.CatmullRomCurve3([cableTop, jibTip]);
    const jibCableTube = new THREE.TubeGeometry(jibCableCurve, 20, 0.015, 6, false);
    group.add(new THREE.Mesh(jibCableTube, solidMat(0xaaccee, 0.6)));

    // Intermediate cable support
    const midTip = new THREE.Vector3(jibLen * 0.5, mastH + 0.55, 0);
    const midCable = new THREE.CatmullRomCurve3([cableTop, midTip]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(midCable, 15, 0.012, 6, false), solidMat(0x88aacc, 0.4)));

    // Counter-jib cable
    const cjibCableCurve = new THREE.CatmullRomCurve3([cableTop, cjibTip]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(cjibCableCurve, 15, 0.015, 6, false), solidMat(0xaaccee, 0.6)));

    // ── Trolley (cat) on jib
    const trolleyX = jibLen * 0.6;
    const trolleyGeo = new THREE.BoxGeometry(0.2, 0.12, 0.15);
    const trolley = new THREE.Mesh(trolleyGeo, solidMat(YELLOW, 0.8));
    trolley.position.set(trolleyX, mastH + 0.3, 0);
    group.add(trolley);

    // Hoist cable + hook
    const hoistLen = 2.5;
    const hoistGeo = new THREE.CylinderGeometry(0.008, 0.008, hoistLen, 4);
    const hoist = new THREE.Mesh(hoistGeo, solidMat(0xccddee, 0.5));
    hoist.position.set(trolleyX, mastH + 0.3 - hoistLen / 2, 0);
    group.add(hoist);

    // Hook block
    const hookGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const hookBlock = new THREE.Mesh(hookGeo, solidMat(YELLOW, 0.8));
    hookBlock.position.set(trolleyX, mastH + 0.3 - hoistLen, 0);
    group.add(hookBlock);

    // Hook shape
    const hookCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.06, -0.08, 0),
        new THREE.Vector3(0, -0.15, 0),
        new THREE.Vector3(-0.04, -0.1, 0),
    ]);
    const hookTube = new THREE.TubeGeometry(hookCurve, 12, 0.015, 6, false);
    const hookMesh = new THREE.Mesh(hookTube, solidMat(YELLOW, 0.9));
    hookMesh.position.set(trolleyX, mastH + 0.3 - hoistLen - 0.06, 0);
    group.add(hookMesh);

    // ── Operator cab
    const cabGeo = new THREE.BoxGeometry(0.4, 0.35, 0.4);
    const cab = new THREE.Mesh(cabGeo, solidMat(BLUE, 0.6));
    cab.position.set(0.35, mastH + 0.05, 0);
    group.add(cab);
    // Cab window (glass)
    const windowGeo = new THREE.PlaneGeometry(0.32, 0.2);
    const win = new THREE.Mesh(windowGeo, glassMat(0x88ccff, 0.3));
    win.position.set(0.56, mastH + 0.1, 0);
    win.rotation.y = Math.PI / 2;
    group.add(win);

    // ── Sensor dots
    addSensorDot(group, 0, 0, 0, BLUE, 0.06);
    addSensorDot(group, 0, mastH, 0, BLUE, 0.07);
    addSensorDot(group, trolleyX, mastH + 0.3, 0, YELLOW, 0.05);
    addSensorDot(group, jibLen - 0.3, mastH + 0.55, 0, BLUE, 0.05);
    addSensorDot(group, 0, mastH + 0.25 + aFrameH, 0, 0x66eeff, 0.06);

    group.position.set(x, y, z);
    group.scale.set(1.1, 1.1, 1.1);
    models.push(group);
    scene.add(group);
}

/* ──────────────────────────────────────────────────────
   HIGH-RISE BUILDING — Detailed, solid, realistic
   ────────────────────────────────────────────────────── */

function createHighRise(x, y, z) {
    const group = new THREE.Group();
    const ORANGE = 0xff8800;
    const WARM = 0xffaa33;

    const floors = 8;
    const floorH = 0.65;
    const width = 1.4;
    const depth = 1.0;

    // ── Foundation
    const foundGeo = new THREE.BoxGeometry(width + 0.4, 0.2, depth + 0.4);
    const found = new THREE.Mesh(foundGeo, solidMat(0x554422, 0.6));
    found.position.y = -0.1;
    group.add(found);
    addEdges(group, foundGeo, ORANGE, 0.3).position.copy(found.position);

    for (let f = 0; f < floors; f++) {
        const fy = f * floorH;
        const taper = 1 - f * 0.015; // slight taper
        const fw = width * taper;
        const fd = depth * taper;

        // ── Floor slab (solid)
        const slabGeo = new THREE.BoxGeometry(fw, 0.08, fd);
        const slab = new THREE.Mesh(slabGeo, solidMat(ORANGE, 0.55));
        slab.position.y = fy;
        group.add(slab);
        addEdges(group, slabGeo, ORANGE, 0.5).position.set(0, fy, 0);

        // ── Columns at corners
        if (f < floors - 1) {
            const corners = [
                [-fw / 2 + 0.05, -fd / 2 + 0.05], [fw / 2 - 0.05, -fd / 2 + 0.05],
                [fw / 2 - 0.05, fd / 2 - 0.05], [-fw / 2 + 0.05, fd / 2 - 0.05]
            ];
            for (let [cx, cz] of corners) {
                const colGeo = new THREE.BoxGeometry(0.07, floorH, 0.07);
                const col = new THREE.Mesh(colGeo, solidMat(ORANGE, 0.7));
                col.position.set(cx, fy + floorH / 2, cz);
                group.add(col);
            }

            // ── Mid-span columns (structural)
            for (let mx of [-fw / 4, fw / 4]) {
                const mColGeo = new THREE.BoxGeometry(0.05, floorH, 0.05);
                const mCol = new THREE.Mesh(mColGeo, solidMat(ORANGE, 0.4));
                mCol.position.set(mx, fy + floorH / 2, -fd / 2 + 0.05);
                group.add(mCol);
                const mCol2 = mCol.clone();
                mCol2.position.z = fd / 2 - 0.05;
                group.add(mCol2);
            }

            // ── Cross bracing on alternating floors
            if (f % 2 === 0) {
                // Front face diagonal
                const diagPts = [
                    new THREE.Vector3(-fw / 2 + 0.05, fy, -fd / 2 + 0.05),
                    new THREE.Vector3(fw / 2 - 0.05, fy + floorH, -fd / 2 + 0.05)
                ];
                group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(diagPts), edgeMat(ORANGE)));

                // Back face diagonal
                const diagPts2 = [
                    new THREE.Vector3(fw / 2 - 0.05, fy, fd / 2 - 0.05),
                    new THREE.Vector3(-fw / 2 + 0.05, fy + floorH, fd / 2 - 0.05)
                ];
                group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(diagPts2), edgeMat(ORANGE)));
            }

            // ── Window panels (glass)
            if (f > 0 && f < floors - 1) {
                // Front windows
                for (let wx = -fw / 3; wx <= fw / 3; wx += fw / 3) {
                    const winGeo = new THREE.PlaneGeometry(fw / 4 - 0.02, floorH * 0.6);
                    const win = new THREE.Mesh(winGeo, glassMat(0xffcc88, 0.08 + f * 0.01));
                    win.position.set(wx, fy + floorH * 0.4, -fd / 2 + 0.051);
                    group.add(win);
                }
                // Side windows
                for (let wz = -fd / 4; wz <= fd / 4; wz += fd / 2) {
                    const winGeo = new THREE.PlaneGeometry(fd / 3, floorH * 0.6);
                    const win = new THREE.Mesh(winGeo, glassMat(0xffcc88, 0.06 + f * 0.01));
                    win.position.set(fw / 2 - 0.051, fy + floorH * 0.4, wz);
                    win.rotation.y = Math.PI / 2;
                    group.add(win);
                }
            }
        }
    }

    // ── Roof features
    const topY = (floors - 1) * floorH;
    // Mechanical penthouse
    const pentGeo = new THREE.BoxGeometry(width * 0.4, 0.3, depth * 0.4);
    const pent = new THREE.Mesh(pentGeo, solidMat(ORANGE, 0.5));
    pent.position.y = topY + 0.15;
    group.add(pent);
    addEdges(group, pentGeo, ORANGE, 0.5).position.copy(pent.position);

    // Antenna
    const antennaGeo = new THREE.CylinderGeometry(0.015, 0.015, 1, 6);
    const antenna = new THREE.Mesh(antennaGeo, solidMat(WARM, 0.7));
    antenna.position.y = topY + 0.8;
    group.add(antenna);

    // Antenna tip light
    addSensorDot(group, 0, topY + 1.3, 0, 0xff3333, 0.04);

    // ── Core (elevator shaft — visible internal)
    const coreGeo = new THREE.BoxGeometry(0.25, floors * floorH, 0.25);
    const core = new THREE.Mesh(coreGeo, glassMat(ORANGE, 0.08));
    core.position.y = floors * floorH / 2 - 0.3;
    group.add(core);
    addEdges(group, coreGeo, ORANGE, 0.2).position.copy(core.position);

    // ── Sensor dots at key structural points
    addSensorDot(group, -width / 2, 0, 0, ORANGE, 0.06);
    addSensorDot(group, width / 2, 0, 0, ORANGE, 0.06);
    addSensorDot(group, 0, topY, 0, ORANGE, 0.08);
    for (let sf = 2; sf < floors; sf += 2) {
        addSensorDot(group, width / 2 * (1 - sf * 0.015) - 0.05, sf * floorH, -depth / 2 * (1 - sf * 0.015) + 0.05, WARM, 0.04);
    }

    group.position.set(x, y, z);
    models.push(group);
    scene.add(group);
    group.scale.set(1.2, 1.2, 1.2);
}

/* ──────────────────────────────────────────────────────
   COMMUNICATIONS TOWER — Lattice radio/cell tower
   ────────────────────────────────────────────────────── */

function createRadioTower(x, y, z) {
    const group = new THREE.Group();
    const PINK = 0xff3388;
    const PURPLE = 0xaa44ff;

    const totalH = 7;
    const sections = 5;
    const baseW = 0.8;

    // ── Foundation pad
    const padGeo = new THREE.BoxGeometry(1.2, 0.12, 1.2);
    const pad = new THREE.Mesh(padGeo, solidMat(PINK, 0.5));
    pad.position.y = 0;
    group.add(pad);
    addEdges(group, padGeo, PINK, 0.4).position.copy(pad.position);

    // ── Lattice mast — tapered sections
    for (let s = 0; s < sections; s++) {
        const secH = totalH / sections;
        const botY = s * secH + 0.1;
        const topY = (s + 1) * secH + 0.1;
        const taper = 1 - (s / sections) * 0.6;  // narrows at top
        const botW = baseW * (1 - (s / sections) * 0.6);
        const topW = baseW * (1 - ((s + 1) / sections) * 0.6);

        // 3 corner legs (triangular cross-section)
        const angles = [0, 2 * Math.PI / 3, 4 * Math.PI / 3];
        for (let a of angles) {
            const bx = Math.cos(a) * botW / 2;
            const bz = Math.sin(a) * botW / 2;
            const tx = Math.cos(a) * topW / 2;
            const tz = Math.sin(a) * topW / 2;

            // Leg
            const legPts = [new THREE.Vector3(bx, botY, bz), new THREE.Vector3(tx, topY, tz)];
            const legCurve = new THREE.CatmullRomCurve3(legPts);
            const legTube = new THREE.TubeGeometry(legCurve, 4, 0.025, 6, false);
            group.add(new THREE.Mesh(legTube, solidMat(PINK, 0.75)));
        }

        // Horizontal ring at each section
        const ringR = (botW + topW) / 4;
        const ringY = botY + secH / 2;
        const hRingGeo = new THREE.TorusGeometry(ringR, 0.012, 6, 12);
        const hRing = new THREE.Mesh(hRingGeo, solidMat(PINK, 0.5));
        hRing.position.y = ringY;
        hRing.rotation.x = Math.PI / 2;
        group.add(hRing);

        // X-bracing on each face
        for (let i = 0; i < 3; i++) {
            const a1 = angles[i];
            const a2 = angles[(i + 1) % 3];
            const b1 = new THREE.Vector3(Math.cos(a1) * botW / 2, botY, Math.sin(a1) * botW / 2);
            const t2 = new THREE.Vector3(Math.cos(a2) * topW / 2, topY, Math.sin(a2) * topW / 2);
            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([b1, t2]), edgeMat(PINK)));
        }
    }

    // ── Platform at 60% height
    const platY = totalH * 0.6;
    const platW = baseW * 0.7;
    const platGeo = new THREE.CylinderGeometry(platW, platW, 0.06, 6);
    const plat = new THREE.Mesh(platGeo, solidMat(PINK, 0.6));
    plat.position.y = platY;
    group.add(plat);
    addEdges(group, platGeo, PINK, 0.5).position.copy(plat.position);

    // Platform railing
    const railGeo = new THREE.TorusGeometry(platW + 0.05, 0.01, 6, 12);
    const rail = new THREE.Mesh(railGeo, solidMat(PINK, 0.4));
    rail.position.y = platY + 0.15;
    rail.rotation.x = Math.PI / 2;
    group.add(rail);

    // ── Antenna arrays on platform
    for (let ai = 0; ai < 3; ai++) {
        const ang = (ai / 3) * Math.PI * 2;
        const ax = Math.cos(ang) * platW * 0.7;
        const az = Math.sin(ang) * platW * 0.7;
        const panelGeo = new THREE.BoxGeometry(0.15, 0.25, 0.04);
        const panel = new THREE.Mesh(panelGeo, solidMat(PURPLE, 0.7));
        panel.position.set(ax, platY + 0.2, az);
        panel.lookAt(new THREE.Vector3(ax * 3, platY + 0.2, az * 3));
        group.add(panel);
        addEdges(group, panelGeo, PURPLE, 0.5).position.copy(panel.position).applyQuaternion(panel.quaternion);
    }

    // ── Top antenna mast
    const topMastH = 1.2;
    const topMastGeo = new THREE.CylinderGeometry(0.015, 0.02, topMastH, 6);
    const topMast = new THREE.Mesh(topMastGeo, solidMat(PINK, 0.8));
    topMast.position.y = totalH + 0.1 + topMastH / 2;
    group.add(topMast);

    // Top beacon
    addSensorDot(group, 0, totalH + 0.1 + topMastH, 0, 0xff0044, 0.06);

    // ── Dish antenna
    const dishGeo = new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI);
    const dish = new THREE.Mesh(dishGeo, solidMat(PURPLE, 0.5));
    dish.position.set(0.3, totalH * 0.45, 0);
    dish.rotation.z = -Math.PI / 6;
    group.add(dish);

    // ── Guy wires (3 cables from top to ground)
    for (let gi = 0; gi < 3; gi++) {
        const ang = (gi / 3) * Math.PI * 2 + 0.3;
        const gx = Math.cos(ang) * 2.0;
        const gz = Math.sin(ang) * 2.0;
        const wirePts = [
            new THREE.Vector3(0, totalH * 0.8, 0),
            new THREE.Vector3(gx * 0.5, totalH * 0.4, gz * 0.5),
            new THREE.Vector3(gx, 0, gz)
        ];
        const wireCurve = new THREE.CatmullRomCurve3(wirePts);
        const wireTube = new THREE.TubeGeometry(wireCurve, 15, 0.008, 4, false);
        group.add(new THREE.Mesh(wireTube, solidMat(0x88aacc, 0.3)));

        // Ground anchor
        const anchorGeo = new THREE.BoxGeometry(0.12, 0.06, 0.12);
        const anchor = new THREE.Mesh(anchorGeo, solidMat(PINK, 0.4));
        anchor.position.set(gx, 0, gz);
        group.add(anchor);
    }

    // ── Sensor dots
    addSensorDot(group, 0, 0.1, 0, PINK, 0.06);
    addSensorDot(group, 0, totalH * 0.3, 0, PINK, 0.05);
    addSensorDot(group, 0, totalH * 0.6, 0, PURPLE, 0.06);
    addSensorDot(group, 0, totalH, 0, PINK, 0.07);

    group.position.set(x, y, z);
    group.scale.set(1.1, 1.1, 1.1);
    models.push(group);
    scene.add(group);
}

/* ──────────────────────────────────────────────────────
   ENERGY RINGS — orbiting scanner rings
   ────────────────────────────────────────────────────── */

function createEnergyRings() {
    const ringColors = [0x00ffc8, 0x00aaff, 0xff8800, 0xff3388];
    for (let i = 0; i < 4; i++) {
        const ringGeo = new THREE.TorusGeometry(0.9 + i * 0.12, 0.01, 8, 64);
        const ring = new THREE.Mesh(ringGeo, glowMat(ringColors[i], 0.3));
        ring.position.copy(models[i]?.position || new THREE.Vector3(0, 1, 0));
        ring.userData = { modelIndex: i, speed: 0.25 + i * 0.12, axis: i };
        energyPulses.push(ring);
        scene.add(ring);
    }
}

/* ──────────────────────────────────────────────────────
   PARTICLES — floating energy dust
   ────────────────────────────────────────────────────── */

function createParticles() {
    const count = 400;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [
        new THREE.Color(0x00ffc8),
        new THREE.Color(0x00aaff),
        new THREE.Color(0xff8800),
        new THREE.Color(0x6633ff),
    ];

    for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 50;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 25;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 30;

        const c = palette[Math.floor(Math.random() * palette.length)];
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
        size: 0.04,
        transparent: true,
        opacity: 0.7,
        vertexColors: true,
    });
    scene.add(new THREE.Points(geo, mat));
}

/* ──────────────────────────────────────────────────────
   ANIMATION LOOP
   ────────────────────────────────────────────────────── */

function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    // Rotate models slowly
    models.forEach((m, i) => {
        m.rotation.y = t * 0.12 + i * Math.PI * 0.6;
        m.position.y += Math.sin(t * 0.4 + i * 2.5) * 0.0008;
    });

    // Sensor dot pulsing
    models.forEach(m => {
        m.traverse(child => {
            if (child.isMesh && child.geometry.type === 'SphereGeometry') {
                const scale = 1 + Math.sin(t * 3.5 + child.position.x * 4 + child.position.y * 3) * 0.35;
                child.scale.set(scale, scale, scale);
            }
            if (child.isMesh && child.geometry.type === 'RingGeometry') {
                child.lookAt(camera.position);
                const ringScale = 1 + Math.sin(t * 2 + child.position.y * 5) * 0.2;
                child.scale.set(ringScale, ringScale, ringScale);
            }
        });
    });

    // Energy rings orbit
    energyPulses.forEach((ring, i) => {
        const target = models[ring.userData.modelIndex];
        if (target) {
            ring.position.copy(target.position);
            ring.position.y += 1.5;
        }
        const speed = ring.userData.speed;
        ring.rotation.x = t * speed;
        ring.rotation.y = t * speed * 0.7;
        ring.rotation.z = t * speed * 0.3;
        ring.material.opacity = 0.15 + Math.sin(t * 2 + i) * 0.1;
    });

    // Camera subtle movement
    camera.position.x += (mouseX * 3.5 - camera.position.x) * 0.012;
    camera.position.y += (-mouseY * 2 + 4 - camera.position.y) * 0.012;
    camera.lookAt(0, 2, 0);

    renderer.render(scene, camera);
}

/* ──────────────────────────────────────────────────────
   INTERACTIONS
   ────────────────────────────────────────────────────── */

const reticle = document.getElementById('reticle');

document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = (e.clientY / window.innerHeight) * 2 - 1;

    reticle.style.left = e.clientX + 'px';
    reticle.style.top = e.clientY + 'px';

    document.getElementById('tel-freq').textContent =
        (2.0 + Math.sin(Date.now() * 0.001) * 0.5).toFixed(2) + 'Hz';
    document.getElementById('tel-amp').textContent =
        (0.08 + Math.abs(mouseX) * 0.15).toFixed(2) + 'mm';
    document.getElementById('tel-grid').textContent =
        String(Math.floor(e.clientX * 0.2)).padStart(3, '0') + '.' +
        String(Math.floor(e.clientY * 0.3)).padStart(3, '0');
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

function enterDashboard() {
    const overlay = document.getElementById('transition-overlay');
    overlay.classList.add('active');
    setTimeout(() => {
        window.location.href = '/dashboard';
    }, 900);
}

setInterval(() => {
    document.getElementById('mp-fps').textContent = Math.floor(28 + Math.random() * 4);
    document.getElementById('mp-latency').textContent = Math.floor(10 + Math.random() * 5) + 'ms';
}, 2000);

// Init
initScene();
