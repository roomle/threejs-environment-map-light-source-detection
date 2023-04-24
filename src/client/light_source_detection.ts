import { 
    Vector2,
    Vector3, 
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
