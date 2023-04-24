import { setupDragDrop } from './drag_target';
import { loadEnvironmentTexture } from './environment'; 
import {
    AxesHelper,
    BoxGeometry,
    Color,
    DirectionalLight,
    DoubleSide,
    GridHelper,
    Light,
    Mesh,
    MeshBasicMaterial,
    MeshPhysicalMaterial,
    Object3D,
    OrthographicCamera,
    PCFSoftShadowMap,
    PerspectiveCamera,
    PlaneGeometry,
    PMREMGenerator,
    Scene,
    ShadowMaterial,
    sRGBEncoding,
    Texture,
    WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
// @ts-ignore
import Stats from 'three/examples/jsm/libs/stats.module' 
import { GUI } from 'dat.gui'

export const environmentMapLightSourceDetection = (map_canvas: any, scene_canvas: any) => {
    const mapRenderer = createMapRendererAndScene(map_canvas);
    const sceneRenderer = createSceneRendererAndScene(scene_canvas);

    // @ts-ignore
    const stats = new Stats();
    document.body.appendChild(stats.dom);
    const gui = new GUI();

    const setEnvironmentMap = (texture: Texture) => {
        mapRenderer.mapPlane.material.map = texture;
        mapRenderer.mapPlane.material.needsUpdate = true;
        setEnvironmentMaoAndCreateLightSources(sceneRenderer.renderer, sceneRenderer.scene, texture);
    }
    loadEnvironmentTexture('blue_photo_studio_1k.hdr', './blue_photo_studio_1k.hdr', setEnvironmentMap);
    setupDragDrop('holder', 'hover', (file: File, event: ProgressEvent<FileReader>) => {
        // @ts-ignore
        loadEnvironmentTexture(file.name, event.target.result, setEnvironmentMap);
    });

    window.addEventListener('resize', () => {
        const width = window.innerWidth / 2;
        const height = window.innerHeight;
        const aspect = width / height;
        mapRenderer.camera.left = -1;
        mapRenderer.camera.right = 1;
        mapRenderer.camera.bottom = -1/aspect;
        mapRenderer.camera.top = 1/aspect;
        mapRenderer.camera.updateProjectionMatrix();
        mapRenderer.renderer.setSize(width, height);
        sceneRenderer.camera.aspect = width / height;
        sceneRenderer.camera.updateProjectionMatrix();
        sceneRenderer.renderer.setSize(width, height);
    }, false);

    let previousTimeStamp: number | undefined;
    const animate = (timestamp: number) => {
        const deltaTimeMs = timestamp - (previousTimeStamp ?? timestamp);
        previousTimeStamp = timestamp;
        requestAnimationFrame(animate);
        sceneRenderer.objectMesh.rotation.y += 45 * Math.PI / 180 * deltaTimeMs / 1000;
        sceneRenderer.controls.update();
        render();
        stats.update()
    }

    const render = () => {
        mapRenderer.renderer.render(mapRenderer.scene, mapRenderer.camera);
        sceneRenderer.renderer.render(sceneRenderer.scene, sceneRenderer.camera);
    }
    requestAnimationFrame(animate);
}

export const createMapRendererAndScene = (map_canvas: any): any => {
    const mapRenderer = new WebGLRenderer({canvas: map_canvas, antialias: true, alpha: true});
    mapRenderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(mapRenderer.domElement);
    mapRenderer.setSize(window.innerWidth / 2, window.innerHeight);
    mapRenderer.setPixelRatio(window.devicePixelRatio);

    const aspect = window.innerWidth / 2 / window.innerHeight;
    const camera = new OrthographicCamera(-1, 1, 1/aspect, -1/aspect, -1, 1);
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
    //planeMesh.rotateX(Math.PI);
    planeMesh.position.z = -0.1;
    scene.add(planeMesh);

    return {
        renderer: mapRenderer,
        camera: camera,
        scene: scene,
        mapPlane: planeMesh,
    };
}

export const createSceneRendererAndScene = (map_canvas: any): any => {
    const sceneRenderer = new WebGLRenderer({canvas: map_canvas, antialias: true, alpha: true});
    document.body.appendChild(sceneRenderer.domElement);
    sceneRenderer.shadowMap.enabled = true;
    sceneRenderer.shadowMap.type = PCFSoftShadowMap;
    sceneRenderer.setSize(window.innerWidth / 2, window.innerHeight);
    sceneRenderer.setPixelRatio(window.devicePixelRatio);
    sceneRenderer.outputEncoding = sRGBEncoding;

    const camera = new PerspectiveCamera(75, window.innerWidth / 2 / window.innerHeight, 0.1, 1000);
    camera.position.y = 4;
    camera.position.z = 8;
    const controls = new OrbitControls(camera, sceneRenderer.domElement);

    const scene = new Scene();
    scene.background = new Color(0xc0c0c0);

    const groundGeometry = new PlaneGeometry(10, 10);
    groundGeometry.rotateX(-Math.PI / 2);
    const groundMaterial = new ShadowMaterial();
    const groundMesh = new Mesh(groundGeometry, groundMaterial);
    groundMesh.receiveShadow = true;
    groundMesh.position.y = -0.5;
    scene.add(groundMesh);

    const cubeGeometry = new BoxGeometry(1, 1, 1);
    const cubeMaterial = new MeshPhysicalMaterial({color: 0xe02020});
    const cubeMesh = new Mesh(cubeGeometry, cubeMaterial);
    cubeMesh.castShadow = true;
    cubeMesh.receiveShadow = true;
    scene.add(cubeMesh);

    return {
        renderer: sceneRenderer,
        camera: camera,
        scene: scene,
        controls: controls,
        objectMesh: cubeMesh,
    };
}

let pmremGenerator: PMREMGenerator | undefined;
const setEnvironmentMaoAndCreateLightSources = (renderer: WebGLRenderer, scene: Scene, equirectangularTexture: Texture) => {
    pmremGenerator = pmremGenerator ?? new PMREMGenerator(renderer);
    const environmentTexture = pmremGenerator.fromEquirectangular(equirectangularTexture).texture;
    scene.environment = environmentTexture;
    scene.background = environmentTexture;

    const oldLightSources: Light[] = []
    scene.traverse((object: Object3D) => {
        // @ts-ignore
        if (object.isLight) {
            oldLightSources.push(object as Light);
        }
    });
    oldLightSources.forEach((lightSource: Light) => lightSource.removeFromParent());

    const directionalTestLight = new DirectionalLight(0xffffff, 0.5);
    directionalTestLight.position.set(1, 3, 1);
    directionalTestLight.castShadow = true;
    scene.add(directionalTestLight);
}

// @ts-ignore
environmentMapLightSourceDetection(three_canvas_map, three_canvas_scene);
