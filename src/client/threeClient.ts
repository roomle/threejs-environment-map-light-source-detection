import { setupDragDrop } from './drag_target';
import { loadEnvironmentTexture } from './environment'; 
import { 
    createEquirectangularSamplePoints,
    grayscaleTextureFromFloatArray, 
    redFromRgbaToNormalizedFloatArray,
    sphereToEquirectangular,
    TextureConverter,
    TextureConverterResult,
} from './light_source_detection';
import {
    AxesHelper,
    BoxGeometry,
    CircleGeometry,
    Color,
    ColorRepresentation,
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
    Vector2,
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
    const environmentManager = new EnvironmentManager(mapRenderer, sceneRenderer);

    // @ts-ignore
    const stats = new Stats();
    document.body.appendChild(stats.dom);
    const gui = new GUI();
    gui.add<any>(environmentManager, 'map', ['color', 'grayscale', 'detector']).onChange(() => environmentManager.setMapPlaneTexture());

    const setEnvironmentMap = (texture: Texture) => {
        environmentManager.setEnvironmentMaoAndCreateLightSources(texture);
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

export const createMapRendererAndScene = (map_canvas: any): MapRenderer => {
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

export const createSceneRendererAndScene = (map_canvas: any): SceneRenderer => {
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

interface MapRenderer {
    renderer: WebGLRenderer,
    camera: OrthographicCamera,
    scene: Scene,
    mapPlane: Mesh,
}

interface SceneRenderer {
    renderer: WebGLRenderer,
    camera: PerspectiveCamera,
    scene: Scene,
    controls: OrbitControls,
    objectMesh: Mesh,
};

class EnvironmentManager {
    public map: string = 'detector';
    private detectorWidth: number = 1024;
    private detectorHeight: number = 512;
    private detectorArray: Float32Array = new Float32Array(0);
    private mapRenderer: MapRenderer;
    private sceneRenderer: SceneRenderer;
    private pmremGenerator?: PMREMGenerator;
    private textureConverter?: TextureConverter;
    private equirectangularTexture: Texture = new Texture();
    private grayscaleTexture: TextureConverterResult = { 
        texture: new Texture(),
        pixels: new Uint8Array(0),
    };
    private detectorTexture: Texture = new Texture();

    constructor(mapRenderer: MapRenderer, sceneRenderer: SceneRenderer) {
        this.mapRenderer = mapRenderer;
        this.sceneRenderer = sceneRenderer;
    }

    public setEnvironmentMaoAndCreateLightSources(equirectangularTexture: Texture) {
        this.createTextures(equirectangularTexture);
        this.removeDeprecatedObjectsFromScene(this.mapRenderer.scene);
        this.removeLightSourcesFromScene(this.sceneRenderer.scene);
        this.setMapPlaneTexture();
        this.setSceneEnvironment();
        
        const directionalTestLight = new DirectionalLight(0xffffff, 0.5);
        directionalTestLight.position.set(1, 3, 1);
        directionalTestLight.castShadow = true;
        this.sceneRenderer.scene.add(directionalTestLight);

        const samplePoints = createEquirectangularSamplePoints(1000);
        const sampleUVs = samplePoints.map((point) => sphereToEquirectangular(point));
        this.debugDrawSamplePoints(sampleUVs, 0x00ff00);
    }

    private createTextures(equirectangularTexture: Texture) {
        this.equirectangularTexture = equirectangularTexture;
        this.textureConverter = this.textureConverter ?? new TextureConverter();
        this.grayscaleTexture = this.textureConverter.newGrayscaleTexture(
            this.mapRenderer.renderer, this.equirectangularTexture, this.detectorWidth, this.detectorHeight);
        this.detectorArray = redFromRgbaToNormalizedFloatArray(this.grayscaleTexture.pixels, 2);
        this.detectorTexture = grayscaleTextureFromFloatArray(
            this.detectorArray, this.detectorWidth, this.detectorHeight);
    }

    public setSceneEnvironment() {
        this.pmremGenerator = this.pmremGenerator ?? new PMREMGenerator(this.sceneRenderer.renderer);
        const environmentTexture = this.pmremGenerator.fromEquirectangular(this.equirectangularTexture).texture;
        this.sceneRenderer.scene.environment = environmentTexture;
        this.sceneRenderer.scene.background = environmentTexture;
    }

    public setMapPlaneTexture() {
        if (this.mapRenderer.mapPlane.material instanceof MeshBasicMaterial) {
            switch (this.map) {
                default:
                case 'color':
                    this.mapRenderer.mapPlane.material.map = this.equirectangularTexture;
                    break;
                case 'grayscale':
                    this.mapRenderer.mapPlane.material.map = this.grayscaleTexture.texture;
                    break;
                case 'detector':
                    this.mapRenderer.mapPlane.material.map = this.detectorTexture;
                    break;
            }
            this.mapRenderer.mapPlane.material.needsUpdate = true;
        }
    }

    private removeDeprecatedObjectsFromScene(scene: Scene) {
        const deprecatedObjects: Object3D[] = []
        scene.traverse((object: Object3D) => {
            if (object.name === 'samplePoint') {
                deprecatedObjects.push(object);
            }
        });
        deprecatedObjects.forEach((item: Object3D) => item.removeFromParent());
    }

    private removeLightSourcesFromScene(scene: Scene) {
        const oldLightSources: Light[] = []
        scene.traverse((object: Object3D) => {
            // @ts-ignore
            if (object.isLight) {
                oldLightSources.push(object as Light);
            }
        });
        oldLightSources.forEach((lightSource: Light) => lightSource.removeFromParent());
    }

    private debugDrawSamplePoints(samplePoints: Vector2[], color: ColorRepresentation) {
        // TODO TREE.Points https://threejs.org/docs/#api/en/objects/Points
        const samplePointGeometry = new CircleGeometry(0.005, 8, 4);
        const samplePointMaterial = new MeshBasicMaterial({color: color});
        samplePoints.forEach((samplePoint: Vector2) => {
            const samplePointMesh = new Mesh(samplePointGeometry, samplePointMaterial);
            samplePointMesh.position.x = samplePoint.x * 2 - 1;
            samplePointMesh.position.y = samplePoint.y - 0.5;
            samplePointMesh.position.z = 0;
            samplePointMesh.name = 'samplePoint';
            this.mapRenderer.scene.add(samplePointMesh);
        });
    }
}

// @ts-ignore
environmentMapLightSourceDetection(three_canvas_map, three_canvas_scene);
