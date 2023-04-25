import {
    DataTexture,
    Mesh,
    MeshBasicMaterial,
    OrthographicCamera,
    PlaneGeometry,
    ShaderMaterial,
    Texture,
    UniformsUtils,
    Vector2,
    Vector3,
    WebGLRenderer, 
    WebGLRenderTarget,
} from 'three';

export const sphereToEquirectangular = (pointOnSphere: Vector3): Vector2 => { 
    const u = Math.atan2(pointOnSphere.y, pointOnSphere.x) / (2 * Math.PI) + 0.5;
    const v = Math.asin(pointOnSphere.z) / Math.PI + 0.5;
    return new Vector2(u, v);
}

export const equirectangularToSphere = (uv: Vector2): Vector3 => {
    const theta = (uv.x - 0.5) * 2 * Math.PI;
    const phi = (uv.y - 0.5) * Math.PI;
    const length = Math.cos(phi);
    return new Vector3(
        Math.cos(theta) * length,
        Math.sin(theta) * length,
        Math.sin(phi));
}

export interface TextureConverterResult {
    texture: Texture,
    pixels: Uint8Array,
}

export class TextureConverter {
    private _colorRenderTarget?: WebGLRenderTarget;
    private _grayscaleRenderTarget?: WebGLRenderTarget;
    private _grayscaleShaderMaterial?: GrayscaleShaderMaterial;
    private _camera?: OrthographicCamera;
    private planeMesh?: Mesh;

    get colorRenderTarget(): WebGLRenderTarget {
        this._colorRenderTarget = this._colorRenderTarget ?? new WebGLRenderTarget();
        return this._colorRenderTarget;
    }

    get grayscaleRenderTarget(): WebGLRenderTarget {
        this._grayscaleRenderTarget = this._grayscaleRenderTarget ?? new WebGLRenderTarget();
        //this._grayscaleRenderTarget = this._grayscaleRenderTarget ?? new WebGLRenderTarget(1, 1, { format: RedFormat });
        return this._grayscaleRenderTarget;
    }

    get grayscaleShaderMaterial(): GrayscaleShaderMaterial {
        this._grayscaleShaderMaterial = this._grayscaleShaderMaterial ?? new GrayscaleShaderMaterial();
        return this._grayscaleShaderMaterial;
    }

    get camera(): OrthographicCamera {
        this._camera = this._camera ?? new OrthographicCamera(-1, 1, 1, -1, -1, 1);
        return this._camera;
    }
    
    public scaleTexture(renderer: WebGLRenderer, texture: Texture, targetWidth: number, targetHeight: number): TextureConverterResult {
        this.colorRenderTarget.setSize(targetWidth, targetHeight);
        this.planeMesh = this.planeMesh ?? new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial({map: texture}));
        const renderTargetBackup = renderer.getRenderTarget();
        renderer.setRenderTarget(this.colorRenderTarget);
        renderer.render(this.planeMesh, this.camera);
        renderer.setRenderTarget(renderTargetBackup);
        const colorTexture = this.grayscaleRenderTarget.texture;
        const pixelBuffer = new Uint8Array(targetWidth * targetHeight * 4);
        renderer.readRenderTargetPixels(this.colorRenderTarget, 0, 0, targetWidth, targetHeight, pixelBuffer);
        return { texture: colorTexture, pixels: pixelBuffer, };
    }

    public newGrayscaleTexture(renderer: WebGLRenderer, texture: Texture, targetWidth: number, targetHeight: number): TextureConverterResult {
        this.grayscaleRenderTarget.setSize(targetWidth, targetHeight);
        this.grayscaleShaderMaterial.setSourceTexture(texture);
        this.planeMesh = this.planeMesh ?? new Mesh(new PlaneGeometry(2, 2), this.grayscaleShaderMaterial);
        const renderTargetBackup = renderer.getRenderTarget();
        renderer.setRenderTarget(this.grayscaleRenderTarget);
        renderer.render(this.planeMesh, this.camera);
        renderer.setRenderTarget(renderTargetBackup);
        const grayscaleTexture = this.grayscaleRenderTarget.texture;
        const pixelBuffer = new Uint8Array(targetWidth * targetHeight * 4);
        renderer.readRenderTargetPixels(this.grayscaleRenderTarget, 0, 0, targetWidth, targetHeight, pixelBuffer);
        return { texture: grayscaleTexture, pixels: pixelBuffer, };
    }
}

const GrayscaleShader = {
    uniforms: {
        tDiffuse: { value: null as Texture | null },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = (projectionMatrix * modelViewMatrix * vec4(position, 1.0)).xyww;
        }`,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            float grayscale = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
            //float grayscale = dot(color.rgb, vec3(1.0/3.0));
            gl_FragColor = vec4(vec3(grayscale), 1.0);
        }`,
};

export class GrayscaleShaderMaterial extends ShaderMaterial {
    constructor() {
        super({
        uniforms: UniformsUtils.clone(GrayscaleShader.uniforms),
        vertexShader: GrayscaleShader.vertexShader,
        fragmentShader: GrayscaleShader.fragmentShader,
        });
    }

    setSourceTexture(map: Texture) {
        this.uniforms.tDiffuse.value = map;
    }
}

export class LightSourceDetector {
    private numberOfSamples: number;
    private width: number;
    private height: number;
    private sampleThreshold: number;
    public readonly samplePoints: Vector3[] = [];
    public readonly sampleUVs: Vector2[] = [];
    public grayscaleTexture: TextureConverterResult = { 
        texture: new Texture(),
        pixels: new Uint8Array(0),
    };
    public detectorTexture: Texture = new Texture();
    public detectorArray: Float32Array = new Float32Array(0);
    private textureConverter?: TextureConverter;
    public lightSamples: LightSample[] = [];
    public lightGraph: LightGraph = new LightGraph(0);
    public lightSources: LightSource[] = [];

    constructor(parameters?: any) {
        this.numberOfSamples = parameters?.numberOfSamples ?? 1000;
        this.width = parameters?.width ?? 1024;
        this.height = parameters?.height ?? 512;
        this.sampleThreshold = parameters?.sampleThreshold ?? 0.707;
        this.samplePoints = this.createEquirectangularSamplePoints(this.numberOfSamples);
        this.sampleUVs = this.samplePoints.map((point) => sphereToEquirectangular(point));
    }

    public detectLightSources(renderer: WebGLRenderer, equirectangularTexture: Texture) {
        this.textureConverter = this.textureConverter ?? new TextureConverter();
        this.grayscaleTexture = this.textureConverter.newGrayscaleTexture(
            renderer, equirectangularTexture, this.width, this.height);
        this.detectorArray = this.redFromRgbaToNormalizedFloatArray(this.grayscaleTexture.pixels);
        this.detectorTexture = this.grayscaleTextureFromFloatArray(
            this.detectorArray, this.width, this.height);
        this.lightSamples = this.filterLightSamples(this.sampleThreshold);
        this.lightGraph = this.findClusterSegments(this.lightSamples, this.sampleThreshold);
        this.lightGraph.findConnectedComponents()
        this.lightSources = this.createLightSourcesFromLightGraph(this.lightSamples, this.lightGraph);
    }

    private createEquirectangularSamplePoints = (numberOfPoints: number): Vector3[] => {
        const points: Vector3[] = [];
        for (let i = 0; i < numberOfPoints; i++) {
            const spiralAngle = i * Math.PI * (3 - Math.sqrt(5));
            const z = 1 - (i / (numberOfPoints - 1)) * 2;
            const radius = Math.sqrt(1 - z * z);
            const x = Math.cos(spiralAngle) * radius;
            const y = Math.sin(spiralAngle) * radius;
            points.push(new Vector3(x, y, z));
        }
        return points;
    }

    private redFromRgbaToNormalizedFloatArray(rgba: Uint8Array, exponent?: number): Float32Array {
        const floatArray = new Float32Array(rgba.length / 4);
        let minimumValue = 1;
        let maximumValue = 0;
        for (let i=0; i < rgba.length / 4; ++i) {
            const value = rgba[i * 4] / 255;
            minimumValue = Math.min(minimumValue, value);
            maximumValue = Math.max(maximumValue, value);
            floatArray[i] = value;
        }
        if (exponent) {
            for (let i=0; i < floatArray.length; ++i) {
                const normalizedValue = (floatArray[i] - minimumValue) / (maximumValue - minimumValue);
                floatArray[i] = Math.pow(normalizedValue, exponent);
            }
        } else {
            for (let i=0; i < floatArray.length; ++i) {
                floatArray[i] = (floatArray[i] - minimumValue) / (maximumValue - minimumValue);
            }
        }
        return floatArray;
    }

    private grayscaleTextureFromFloatArray(floatArray: Float32Array, width: number, height: number): Texture {
        const noOfPixels = width * height;
        const uint8data = new Uint8Array(4 * noOfPixels);
        for (let i = 0; i < noOfPixels; i ++) {
            const grayscale = floatArray[i] * 255;
            uint8data[i * 4 + 0] = grayscale;
            uint8data[i * 4 + 1] = grayscale;
            uint8data[i * 4 + 2] = grayscale;
            uint8data[i * 4 + 3] = 255;
        }
        const dataTexture = new DataTexture(uint8data, width, height);
        dataTexture.needsUpdate = true;
        return dataTexture;
    }

    private filterLightSamples(threshold: number): LightSample[] {
        const lightSamples: LightSample[] = [];
        for (let i = 0; i < this.sampleUVs.length; i++) {
            const uv = this.sampleUVs[i];
            const value = this.luminanceValueFromUV(uv);
            if (value > threshold) {
                lightSamples.push(new LightSample(this.samplePoints[i], uv));
            }
        }
        return lightSamples;
    }

    private luminanceValueFromUV(uv: Vector2): number {
        const column = Math.floor(uv.x * this.width);
        const row = Math.floor(uv.y * this.height);
        const index = row * this.width + column;
        return this.detectorArray[index];
    }

    private findClusterSegments(samples: LightSample[], threshold: number): LightGraph {
        const pointDistance = Math.sqrt(4 * Math.PI) / Math.sqrt(this.numberOfSamples);
        const pixelDistance = Math.sqrt(2) * Math.PI * 2 / this.width;
        const stepDistance = pixelDistance * 2;
        const maxDistance = pointDistance * 1.5;
        const lightGraph = new LightGraph(samples.length);
        for (let i = 0; i < samples.length; i++) {
            for (let j = i + 1; j < samples.length; j++) {
                if (samples[i].position.angleTo(samples[j].position) < maxDistance) {
                    const direction = samples[j].position.clone().sub(samples[i].position);
                    const steps = Math.floor(direction.length() / stepDistance);
                    let inTreshold = true;
                    let outOfTresholdCount = 0
                    for (let k = 1; k < steps; k++) {
                        const step = direction.clone().multiplyScalar(k / steps);
                        const uv = sphereToEquirectangular(samples[i].position.clone().add(step).normalize());
                        const value = this.luminanceValueFromUV(uv);
                        if (value < threshold) {
                            outOfTresholdCount++;
                            if (outOfTresholdCount > 1) {
                                inTreshold = false;
                                break;
                            }
                        } else {
                            outOfTresholdCount = 0;
                        }
                    }
                    if (inTreshold) {
                        lightGraph.adjacent[i].push(j);
                        lightGraph.adjacent[j].push(i);
                        lightGraph.edges.push([i, j]);
                    }
                }
            }
        }
        return lightGraph;
    };

    private createLightSourcesFromLightGraph(samples: LightSample[], lightGraph: LightGraph): LightSource[] {
        const lightSources: LightSource[] = lightGraph.components.filter(component => component.length > 1).map(
            component => new LightSource(component.map(index => samples[index])));
        lightSources.forEach(lightSource => lightSource.calculateLightSourceProperties());
        return lightSources;
    }
}

export class LightSample {
    public readonly position: Vector3;
    public readonly uv: Vector2;

    constructor(position: Vector3, uv: Vector2) {
        this.position = position;
        this.uv = uv;
    }
}

export class LightGraph {
    public readonly noOfNodes: number;
    public edges: number[][] = [];
    public adjacent: number[][] = [];
    public components: number[][] = [];
    
    constructor(noOfNodes: number) {
        this.noOfNodes = noOfNodes;
        for (let i = 0; i < noOfNodes; i++) {
            this.adjacent.push([]);
        }
    }

    public findConnectedComponents() {
        const visited = new Array(this.noOfNodes).fill(false);
        this.components = [];
        for (let i = 0; i < this.noOfNodes; i++) {
            if (!visited[i]) {
                const component: number[] = [];
                this.dfs(i, visited, component);
                this.components.push(component);
            }
        }
        this.components.sort((a, b) => b.length - a.length);
    }

    private dfs(node: number, visited: boolean[], component: number[]) {
        visited[node] = true;
        component.push(node);
        for (const adjacentNode of this.adjacent[node]) {
            if (!visited[adjacentNode]) {
                this.dfs(adjacentNode, visited, component);
            }
        }
    }
}

export class LightSource {
    public readonly lightSamples: LightSample[];
    public position: Vector3 = new Vector3();
    public uv: Vector2 = new Vector2();

    constructor(lightSamples: LightSample[]) {
        this.lightSamples = lightSamples;
    }

    public calculateLightSourceProperties() {
        this.position = new Vector3();
        for (const lightSample of this.lightSamples) {
            this.position.add(lightSample.position);
        }
        this.position.normalize();
        this.uv = sphereToEquirectangular(this.position);
    }
}

const bresenhamCheck = (lum: Float32Array, width: number, x0: number, y0: number, x1: number, y1: number): boolean => {

    let dX: number = Math.floor(x1 - x0);
    let stepX: number = Math.sign(dX);
    dX = Math.abs(dX) << 1;
  
    let dY: number = Math.floor(y1 - y0);
    let stepY: number = Math.sign(dY);
    dY = Math.abs(dY) << 1;
  
    const luminanceThreshold: number = 0.15;
    let prevLum: number = lum[x0 + y0 * width];
    let sumLum: number = 0.0;
    let c: number = 0;
  
    if (dX >= dY) {
      // delta may go below zero
      let delta: number = Math.floor(dY - (dX >> 1));
      while (x0 != x1) {
        // reduce delta, while taking into account the corner case of delta == 0
        if ((delta > 0) || (delta == 0 && (stepX > 0))) {
          delta -= dX;
          y0 += stepY;
        }
        delta += dY;
        x0 += stepX;
        sumLum = sumLum + Math.min(lum[x0 + y0 * width], 1.25);
        c = c + 1;
        if (Math.abs(sumLum / c - prevLum) > luminanceThreshold && (sumLum / c) < 1.0) {
          return false;
        }
      }
    } else {
      // delta may go below zero
      let delta: number = Math.floor(dX - (dY >> 1));
      while (y0 != y1) {
        // reduce delta, while taking into account the corner case of delta == 0
        if ((delta > 0) || (delta == 0 && (stepY > 0))) {
          delta -= dY;
          x0 += stepX;
        }
        delta += dX;
        y0 += stepY;
        sumLum = sumLum + Math.min(lum[x0 + y0 * width], 1.25);
        c = c + 1;
        if (Math.abs(sumLum / c - prevLum) > luminanceThreshold && (sumLum / c) < 1.0) {
          return false;
        }
      }
    }
    return true;
  }