import { setupDragDrop } from './drag_target';
import { loadEnvironmentTexture } from './environment'; 
import {
    LightGraph,
    LightSample,
    LightSourceDetector,
} from './light_source_detection';
import {
    AxesHelper,
    BoxGeometry,
    BufferGeometry,
    CircleGeometry,
    Color,
    ColorRepresentation,
    DirectionalLight,
    DoubleSide,
    GridHelper,
    Light,
    LineBasicMaterial,
    LineSegments,
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
    Vector3,
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
    private mapRenderer: MapRenderer;
    private sceneRenderer: SceneRenderer;
    private pmremGenerator?: PMREMGenerator;
    private equirectangularTexture: Texture = new Texture();
    private _lightSourceDetector?: LightSourceDetector;

    get lightSourceDetector(): LightSourceDetector {
        this._lightSourceDetector = this._lightSourceDetector ?? new LightSourceDetector({
            numberOfSamples: 1500,
            width: this.detectorWidth,
            height: this.detectorHeight,
            sampleThreshold: 0.9,
        });
        return this._lightSourceDetector;
    }

    constructor(mapRenderer: MapRenderer, sceneRenderer: SceneRenderer) {
        this.mapRenderer = mapRenderer;
        this.sceneRenderer = sceneRenderer;
    }

    public setEnvironmentMaoAndCreateLightSources(equirectangularTexture: Texture) {
        this.removeDeprecatedObjectsFromScene(this.mapRenderer.scene);
        this.removeLightSourcesFromScene(this.sceneRenderer.scene);
        this.equirectangularTexture = equirectangularTexture;
        this.lightSourceDetector.detectLightSources(this.mapRenderer.renderer, this.equirectangularTexture);
        this.setMapPlaneTexture();
        this.setSceneEnvironment();
        this.createLightGraphInMap(this.lightSourceDetector.sampleUVs, this.lightSourceDetector.lightSamples, this.lightSourceDetector.lightGraph);
        
        const directionalTestLight = new DirectionalLight(0xffffff, 0.5);
        directionalTestLight.position.set(1, 3, 1);
        directionalTestLight.castShadow = true;
        this.sceneRenderer.scene.add(directionalTestLight);
    }

    private createLightGraphInMap(allLightSamplesUVs: Vector2[], lightSamples: LightSample[], lightGraph: LightGraph) {
        let singleLightSamples: LightSample[] = [];
        let clusterLightSamples: LightSample[] = [];
        for (let i=0; i < this.lightSourceDetector.lightGraph.noOfNodes; ++i) {
            if (lightGraph.adjacent[i].length === 0) {
                singleLightSamples.push(lightSamples[i]);
            } else {
                clusterLightSamples.push(lightSamples[i]);
            }
        }
        const singleLightSampleUVs = singleLightSamples.map((sample) => sample.uv);
        const clusterLightSampleUVs = clusterLightSamples.map((sample) => sample.uv);
        const discardedSamples = allLightSamplesUVs.filter((uv) => !singleLightSampleUVs.includes(uv) && !clusterLightSampleUVs.includes(uv));
        this.createSamplePointsInMap(discardedSamples, 0.005, 0xff0000);
        this.createSamplePointsInMap(singleLightSampleUVs, 0.01, 0x0000ff);
        this.createSamplePointsInMap(clusterLightSampleUVs, 0.01, 0x00ff00);
        this.createClusterLinesInMap(this.lightSourceDetector.lightSamples, this.lightSourceDetector.lightGraph.edges, 0x000080);
        const lightSourceUVs = this.lightSourceDetector.lightSources.map((lightSource) => lightSource.uv);
        this.createSamplePointsInMap(lightSourceUVs, 0.015, 0xffff00);
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
                    this.mapRenderer.mapPlane.material.map = this.lightSourceDetector.grayscaleTexture.texture;
                    break;
                case 'detector':
                    this.mapRenderer.mapPlane.material.map = this.lightSourceDetector.detectorTexture;
                    break;
            }
            this.mapRenderer.mapPlane.material.needsUpdate = true;
        }
    }

    private removeDeprecatedObjectsFromScene(scene: Scene) {
        const deprecatedObjects: Object3D[] = []
        scene.traverse((object: Object3D) => {
            if (['samplePoint', 'clusterLine'].includes(object.name)) {
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

    private createSamplePointsInMap(samplePoints: Vector2[], radius: number, color: ColorRepresentation) {
        // TODO TREE.Points https://threejs.org/docs/#api/en/objects/Points
        const samplePointGeometry = new CircleGeometry(radius, 8, 4);
        const samplePointMaterial = new MeshBasicMaterial({color: color});
        samplePoints.forEach((samplePoint: Vector2) => {
            const samplePointMesh = new Mesh(samplePointGeometry, samplePointMaterial);
            samplePointMesh.position.copy(this.uvToMapPosition(samplePoint));
            samplePointMesh.name = 'samplePoint';
            this.mapRenderer.scene.add(samplePointMesh);
        });
    }

    private createClusterLinesInMap(lightSamples: LightSample[], clusterSegments: number[][], color: ColorRepresentation) {
        const lineMaterial = new LineBasicMaterial({color});
        const points: Vector3[] = [];
        clusterSegments.forEach((cluster: number[]) => {
            for (let i = 1; i < cluster.length; i++) {
                const uv0 = lightSamples[cluster[0]].uv;
                const uv1 = lightSamples[cluster[i]].uv;
                points.push(this.uvToMapPosition(uv0));
                if (Math.abs(uv0.x - uv1.x) > 0.5) {
                    const v = (uv0.y + uv1.y) / 2;
                    const u = uv0.x < uv1.x ? 0 : 1;
                    points.push(this.uvToMapPosition(new Vector2(u, v)));
                    points.push(this.uvToMapPosition(new Vector2(1 - u, v)));
                }
                points.push(this.uvToMapPosition(uv1));
            }
        });
        const lineGeometry = new BufferGeometry().setFromPoints(points);   
        const lineMesh = new LineSegments(lineGeometry, lineMaterial);
        lineMesh.name = 'clusterLine';
        this.mapRenderer.scene.add(lineMesh);
    }

    private uvToMapPosition(uv: Vector2): Vector3 {
        return new Vector3(uv.x * 2 - 1, uv.y - 0.5, 0);
    }
}

// @ts-ignore
environmentMapLightSourceDetection(three_canvas_map, three_canvas_scene);
