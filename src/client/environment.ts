import { Texture } from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';

export const loadEnvironmentTexture = (resourceName: string, resource: string, setTexture: (texture: Texture) => void) => {
    const lowerName = resourceName.toLowerCase();
    if (lowerName.endsWith('.exr') ) {
        loadExr(resourceName, resource, setTexture);
    } else if (lowerName.endsWith('.hdr') ) {
        loadRgbe(resourceName, resource, setTexture);
    }
}

let exrLoader: EXRLoader | undefined = undefined;
const loadExr = (resourceName: string, resource: string, setTexture: (texture: Texture) => void) => {
    exrLoader = exrLoader ?? new EXRLoader();
    exrLoader.load(resource, (texture: Texture, _textureData: any) => {
        setTexture(texture);
    });
}

let rgbeLoader: RGBELoader | undefined = undefined;
const loadRgbe = (resourceName: string, resource: string, setTexture: (texture: Texture) => void) => {
    rgbeLoader = rgbeLoader ?? new RGBELoader();
    rgbeLoader.load(resource, (texture: Texture, _textureData: any) => {
        setTexture(texture);
    });
}
