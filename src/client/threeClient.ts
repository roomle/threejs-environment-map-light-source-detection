import { setupDragDrop } from './drag_target';
import { loadEnvironmentTexture } from './environment'; 
import {
    LightSource,
    LightSourceDetector,
} from './light-source-detection';
import { LightSourceDetectorDebug } from './light-source-detection-debug';
import {
    AxesHelper,
    Color,
    DirectionalLight,
    DirectionalLightHelper,
    DoubleSide,
    GridHelper,
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
    SphereGeometry,
    Texture,
    Vector3,
    WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
// @ts-ignore
import { GroundProjectedSkybox } from 'three/examples/jsm/objects/GroundProjectedSkybox.js';
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
    gui.add<any>(environmentManager, 'groundProject').onChange(() => environmentManager.setBackground());

    const setEnvironmentMap = (texture: Texture, textureData: any) => {
        environmentManager.setEnvironmentMaoAndCreateLightSources(texture, textureData);
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

    const planeMesh = LightSourceDetectorDebug.createPlane(scene); 

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

    const camera = new PerspectiveCamera(75, window.innerWidth / 2 / window.innerHeight, 0.1, 1000);
    camera.position.y = 4;
    camera.position.z = 8;
    const controls = new OrbitControls(camera, sceneRenderer.domElement);

    const scene = new Scene();
    scene.background = new Color(0xc0c0c0);

    const groundLevel = 0;
    const objectGeometry = new SphereGeometry(1, 32, 16);
    const objectMaterial = new MeshPhysicalMaterial({color: 0x808080});
    const objectMesh = new Mesh(objectGeometry, objectMaterial);
    objectMesh.position.y = groundLevel + 1;
    objectMesh.castShadow = true;
    objectMesh.receiveShadow = true;
    scene.add(objectMesh);

    const groundGeometry = new PlaneGeometry(10, 10);
    groundGeometry.rotateX(-Math.PI / 2);
    const groundMaterial = new ShadowMaterial();
    groundMaterial.transparent = true;
    groundMaterial.opacity = 0.5;
    const groundMesh = new Mesh(groundGeometry, groundMaterial);
    groundMesh.receiveShadow = true;
    groundMesh.position.y = groundLevel;
    scene.add(groundMesh);

    return {
        renderer: sceneRenderer,
        camera: camera,
        scene: scene,
        controls: controls,
        objectMesh: objectMesh,
        groundLevel,
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
    groundLevel: number,
};

class EnvironmentManager {
    public map: string = 'detector';
    public groundProject: boolean = true;
    private detectorWidth: number = 1024;
    private detectorHeight: number = 512;
    private sampleThreshold: number = 0.9;
    private noOfSamples: number = 1500;
    private lightIntensityThreshold: number = 0.2;
    private lightDistanceScale: number = 5.0;
    private skybox: Mesh | undefined = undefined;
    private mapRenderer: MapRenderer;
    private sceneRenderer: SceneRenderer;
    private pmremGenerator?: PMREMGenerator;
    private equirectangularTexture: Texture = new Texture();
    private _lightSourceDetector?: LightSourceDetector;

    get lightSourceDetector(): LightSourceDetector {
        this._lightSourceDetector = this._lightSourceDetector ?? new LightSourceDetector({
            numberOfSamples: this.noOfSamples,
            width: this.detectorWidth,
            height: this.detectorHeight,
            sampleThreshold: this.sampleThreshold,
        });
        return this._lightSourceDetector;
    }

    constructor(mapRenderer: MapRenderer, sceneRenderer: SceneRenderer) {
        this.mapRenderer = mapRenderer;
        this.sceneRenderer = sceneRenderer;
    }

    public setEnvironmentMaoAndCreateLightSources(equirectangularTexture: Texture, textureData: any) {
        this.removeDeprecatedObjectsFromScene(this.mapRenderer.scene);
        this.removeLightSourcesFromScene(this.sceneRenderer.scene);
        this.equirectangularTexture = equirectangularTexture;
        this.lightSourceDetector.detectLightSources(this.mapRenderer.renderer, this.equirectangularTexture, textureData);
        this.setMapPlaneTexture();
        this.setSceneEnvironment();
        const lightSourceDetectorDebug = new LightSourceDetectorDebug(this.lightSourceDetector);
        lightSourceDetectorDebug.createDebugScene(this.mapRenderer.scene);
        this.createLightSources(this.lightSourceDetector.lightSources);
    }

    public setSceneEnvironment() {
        this.pmremGenerator = this.pmremGenerator ?? new PMREMGenerator(this.sceneRenderer.renderer);
        const environmentTexture = this.pmremGenerator.fromEquirectangular(this.equirectangularTexture).texture;
        this.sceneRenderer.scene.environment = environmentTexture;
        this.skybox = new GroundProjectedSkybox(this.equirectangularTexture) as Mesh;
		this.skybox.scale.setScalar(100);
        this.skybox.name = 'skybox';
	    this.sceneRenderer.scene.add(this.skybox);
        this.setBackground();
    }

    public setBackground() {
        if (this.groundProject) {
            this.sceneRenderer.scene.background = null;
            if (this.skybox !== undefined) {
                this.skybox.visible = true;
            }
        } else {
            this.sceneRenderer.scene.background = this.sceneRenderer.scene.environment;
            if (this.skybox !== undefined) {
                this.skybox.visible = false;
            }
        }
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
        const lightObject: Object3D[] = []
        scene.traverse((object: Object3D) => {
            // @ts-ignore
            if (object.isLight || ['lightHelper', 'skybox'].includes(object.name)) {
                lightObject.push(object);
            }
        });
        lightObject.forEach((item: Object3D) => item.removeFromParent());
    }

    private createLightSources(lightSources: LightSource[]) {
        const mapCenter = new Vector3(0, 0, 0);
        const maxIntensity = lightSources.length > 0 ? Math.max(...lightSources.map((lightSource: LightSource) => lightSource.maxIntensity)) : 1;
        const lightIntensityScale = 1 / maxIntensity;
        for (let i=0; i < lightSources.length; ++i) {
            const lightSource = lightSources[i];
            console.log(lightSource.size);
            const lightIntensity = lightSource.maxIntensity * lightIntensityScale;
            if (lightIntensity < this.lightIntensityThreshold || lightSource.position.z < 0) {
                continue;
            }
            const lightPosition = new Vector3(lightSource.position.x, lightSource.position.z, lightSource.position.y).multiplyScalar(this.lightDistanceScale).add(mapCenter);
            const directionalLight = new DirectionalLight(0xffffff, lightIntensity);
            directionalLight.position.copy(lightPosition);
            directionalLight.lookAt(mapCenter.clone());
            directionalLight.updateMatrix();
            directionalLight.castShadow = true;
            this.sceneRenderer.scene.add(directionalLight);
            const lightHelper = new DirectionalLightHelper(directionalLight, lightIntensity);
            lightHelper.name = 'lightHelper';
            this.sceneRenderer.scene.add(lightHelper);
        }
    }
}

// @ts-ignore
environmentMapLightSourceDetection(three_canvas_map, three_canvas_scene);
