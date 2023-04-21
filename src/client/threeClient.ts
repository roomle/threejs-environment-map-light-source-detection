import { setupDragDrop } from './drag_target';
import { loadEnvironmentTexture } from './environment'; 
import {
    AxesHelper,
    Color,
    GridHelper,
    Mesh,
    MeshBasicMaterial,
    PlaneGeometry,
    Scene,
    Texture,
    WebGLRenderer,
    OrthographicCamera,
    DoubleSide,
} from 'three';
// @ts-ignore
import Stats from 'three/examples/jsm/libs/stats.module' 
import { GUI } from 'dat.gui'

export const helloCube = (map_canvas: any) => {
    const mapRenderer = new WebGLRenderer({canvas: map_canvas, antialias: true, alpha: true});
    mapRenderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(mapRenderer.domElement);
    mapRenderer.setSize(window.innerWidth, window.innerHeight);
    mapRenderer.setPixelRatio(window.devicePixelRatio);

    const aspect = window.innerWidth / window.innerHeight;
    const camera = new OrthographicCamera(-1, 1, -1/aspect, 1/aspect, -1, 1);
    const scene = new Scene();
    scene.background = new Color(0xffffff);

    const gridHelper = new GridHelper(2, 20);
    gridHelper.rotateX(Math.PI / 2);
    scene.add(gridHelper);
    const axesHelper = new AxesHelper(2);
    scene.add(axesHelper);

    const planeGeometry = new PlaneGeometry(2, 1);
    const planeMaterial = new MeshBasicMaterial({color: 0xc0c0c0, side: DoubleSide});
    const planeMesh = new Mesh(planeGeometry, planeMaterial);
    planeMesh.rotateX(Math.PI);
    planeMesh.position.z = -0.1;
    scene.add(planeMesh)

    // @ts-ignore
    const stats = new Stats();
    document.body.appendChild(stats.dom);
    const gui = new GUI();

    loadEnvironmentTexture('blue_photo_studio_1k.hdr', './blue_photo_studio_1k.hdr', (texture: Texture) => {
        planeMaterial.map = texture;
        planeMaterial.needsUpdate = true;
    });
    setupDragDrop('holder', 'hover', (file: File, event: ProgressEvent<FileReader>) => {
        // @ts-ignore
        loadEnvironmentTexture(file.name, event.target.result, (texture: Texture) => {
            planeMaterial.map = texture;
            planeMaterial.needsUpdate = true;
        });
    });

    window.addEventListener('resize', () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const aspect = width / height;
        camera.left = -1;
        camera.right = 1;
        camera.bottom = -1/aspect;
        camera.top = 1/aspect;
        camera.updateProjectionMatrix();
        mapRenderer.setSize(width, height);
    }, false);

    let previousTimeStamp: number | undefined;
    const animate = (timestamp: number) => {
        const deltaTimeMs = timestamp - (previousTimeStamp ?? timestamp);
        previousTimeStamp = timestamp;
        requestAnimationFrame(animate);
        render();
        stats.update()
    }

    const render = () => {
        mapRenderer.render(scene, camera);
    }
    requestAnimationFrame(animate);
}

// @ts-ignore
helloCube(three_canvas_map);
