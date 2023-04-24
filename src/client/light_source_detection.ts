import {
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

export const createEquirectangularSamplePoints = (numberOfPoints: number): Vector3[] => {
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
    
    public scaleTexture(renderer: WebGLRenderer, texture: Texture, targetWidth: number, targetHeight: number): Texture {
        this.colorRenderTarget.setSize(targetWidth, targetHeight);
        this.planeMesh = this.planeMesh ?? new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial({map: texture}));
        const renderTargetBackup = renderer.getRenderTarget();
        renderer.setRenderTarget(this.colorRenderTarget);
        renderer.render(this.planeMesh, this.camera);
        renderer.setRenderTarget(renderTargetBackup);
        return this.colorRenderTarget.texture;
    }

    public newGrayscaleTexture(renderer: WebGLRenderer, texture: Texture, targetWidth: number, targetHeight: number): Texture {
        this.grayscaleRenderTarget.setSize(targetWidth, targetHeight);
        this.grayscaleShaderMaterial.setSourceTexture(texture);
        this.planeMesh = this.planeMesh ?? new Mesh(new PlaneGeometry(2, 2), this.grayscaleShaderMaterial);
        const renderTargetBackup = renderer.getRenderTarget();
        renderer.setRenderTarget(this.grayscaleRenderTarget);
        renderer.render(this.planeMesh, this.camera);
        renderer.setRenderTarget(renderTargetBackup);
        return this.grayscaleRenderTarget.texture;
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