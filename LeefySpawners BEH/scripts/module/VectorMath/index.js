export class Vector3 {
    x = 0;
    y = 0;
    z = 0;
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    /**
     * Adds 2 Vector3's together
     */
    static Add(pos1, pos2) {
        return new Vector3(pos1.x + pos2.x, pos1.y + pos2.y, pos1.z + pos2.z);
    }
    /**
     * Subtracts a Vector3 from another Vector3
     */
    static Subtract(pos1, pos2) {
        return new Vector3(pos1.x - pos2.x, pos1.y - pos2.y, pos1.z - pos2.z);
    }
    /**
     * Divides a Vector3 by another Vector3
     */
    static Divide(pos1, pos2) {
        return new Vector3(pos1.x / pos2.x, pos1.y / pos2.y, pos1.z / pos2.z);
    }
    /**
     * Multiplies a Vector3 with a number
     */
    static Scale(pos1, num) {
        return new Vector3(pos1.x * num, pos1.y * num, pos1.z * num);
    }
    /**
     * Multiplies 2 Vector3's
     */
    static Multiply(pos1, pos2) {
        return new Vector3(pos1.x * pos2.x, pos1.y * pos2.y, pos1.z * pos2.z);
    }
    /**
     * Checks if 2 Vector3s are the same
     */
    static Equals(pos1, pos2, tolerance) {
        if (tolerance === undefined) {
            return pos1.x === pos2.x && pos1.y === pos2.y && pos1.z === pos2.z;
        }
        else {
            return Math.abs(pos1.x - pos2.x) <= tolerance && Math.abs(pos1.y - pos2.y) <= tolerance && Math.abs(pos1.z - pos2.z) <= tolerance;
        }
    }
    /**
     * Returns a Vector3 at 0, 0, 0
     */
    static Zero() {
        return new Vector3(0, 0, 0);
    }
    /**
     * Returns a Vector3 at 0, 1, 0
     */
    static Up() {
        return new Vector3(0, 1, 0);
    }
    /**
     * Returns a Vector3 at 0, -1, 0
     */
    static Down() {
        return new Vector3(0, -1, 0);
    }
    /**
     * Returns a Vector3 at 0, 0, 1
     */
    static Forward() {
        return new Vector3(0, 0, 1);
    }
    /**
     * Returns a Vector3 at 0, 0, -1
     */
    static Back() {
        return new Vector3(0, 0, -1);
    }
    /**
     * Returns a Vector3 at -1, 0, 0
     */
    static Left() {
        return new Vector3(-1, 0, 0);
    }
    /**
     * Returns a Vector3 at 1, 0, 0
     */
    static Right() {
        return new Vector3(1, 0, 0);
    }
    /**
     * Gets the distance between 2 Vector3's
     */
    static Distance(pos1, pos2) {
        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        const dz = pos2.z - pos1.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    /**
     * Linearly interpolates a Vector3 to a Vector3 by a Number
     */
    static Lerp(pos1, pos2, tParam) {
        const x = pos1.x + (pos2.x - pos1.x) * tParam;
        const y = pos1.y + (pos2.y - pos1.y) * tParam;
        const z = pos1.z + (pos2.z - pos1.z) * tParam;
        return new Vector3(x, y, z);
    }
    /**
     * Gets the dot product of 2 vectors
     */
    static Dot(pos1, pos2) {
        return pos1.x * pos2.x + pos1.y * pos2.y + pos1.z * pos2.z;
    }
    /**
     * Gets the cross product of 2 vectors
     */
    static Cross(pos1, pos2) {
        const x = pos1.y * pos2.z - pos1.z * pos2.y;
        const y = pos1.z * pos2.x - pos1.x * pos2.z;
        const z = pos1.x * pos2.y - pos1.y * pos2.x;
        return new Vector3(x, y, z);
    }
    /**
     * Gets the magnitude of a vector
     */
    static Magnitude(pos) {
        return Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
    }
    /**
     * Gets the square magnitude of a vector
     */
    static SqrMagnitude(pos) {
        return pos.x * pos.x + pos.y * pos.y + pos.z * pos.z;
    }
    /**
     * Gets the squared distance between 2 vectors
     */
    static SqrDistance(pos1, pos2) {
        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        const dz = pos2.z - pos1.z;
        return dx * dx + dy * dy + dz * dz;
    }
    /**
     * Normalizes the vector
     */
    static Normalize(dir) {
        const mag = Vector3.Magnitude(dir);
        if (mag !== 0) {
            return new Vector3(dir.x / mag, dir.y / mag, dir.z / mag);
        }
        else {
            return new Vector3(0, 0, 0);
        }
    }
}
export class Vector2 {
    x = 0;
    y = 0;
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    /**
     * Adds 2 Vector2's together
     */
    static Add(pos1, pos2) {
        return new Vector2(pos1.x + pos2.x, pos1.y + pos2.y);
    }
    /**
     * Subtracts a Vector2 from another Vector2
     */
    static Subtract(pos1, pos2) {
        return new Vector2(pos1.x - pos2.x, pos1.y - pos2.y);
    }
    /**
     * Divides a Vector2 by another Vector2
     */
    static Divide(pos1, pos2) {
        return new Vector2(pos1.x / pos2.x, pos1.y / pos2.y);
    }
    /**
     * Multiplies a Vector2 with a number
     */
    static Scale(pos1, scale) {
        return new Vector2(pos1.x * scale, pos1.y * scale);
    }
    /**
     * Multiplies 2 Vector2's
     */
    static Multiply(pos1, pos2) {
        return new Vector2(pos1.x * pos2.x, pos1.y * pos2.y);
    }
    /**
     * Checks if 2 Vector2s are the same
     */
    static Equals(pos1, pos2, tolerance) {
        if (tolerance === undefined) {
            return pos1.x === pos2.x && pos1.y === pos2.y;
        }
        else {
            return Math.abs(pos1.x - pos2.x) <= tolerance && Math.abs(pos1.y - pos2.y) <= tolerance;
        }
    }
    /**
     * Returns a Vector2 at 0, 0
     */
    static Zero() {
        return new Vector2(0, 0);
    }
    /**
     * Returns a Vector2 at 1, 1
     */
    static One() {
        return new Vector2(1, 1);
    }
    /**
      * Returns a Vector2 at 0, 1
      */
    static Up() {
        return new Vector2(0, 1);
    }
    /**
     * Returns a Vector2 at 0, -1
     */
    static Down() {
        return new Vector2(0, -1);
    }
    /**
     * Returns a Vector2 at -1, 0
     */
    static Left() {
        return new Vector2(-1, 0);
    }
    /**
     * Returns a Vector2 at 1, 0
     */
    static Right() {
        return new Vector2(1, 0);
    }
    /**
     * Gets the distance between 2 Vector2's
     */
    static Distance(pos1, pos2) {
        return (Math.abs(pos1.x - pos2.x)) + (Math.abs(pos1.y - pos2.y));
    }
    /**
     * Linearly interpolates a Vector2 to a Vector2 by a Number
     */
    static Lerp(pos1, pos2, tParam) {
        const x = pos1.x + (pos2.x - pos1.x) * tParam;
        const y = pos1.y + (pos2.y - pos1.y) * tParam;
        return new Vector2(x, y);
    }
    /**
     * Gets the dot product of 2 vectors
     */
    static Dot(pos1, pos2) {
        return pos1.x * pos2.x + pos1.y * pos2.y;
    }
    /**
     * Gets the magnitude of a vector
     */
    static Magnitude(pos) {
        return Math.sqrt(pos.x * pos.x + pos.y * pos.y);
    }
    /**
     * Gets the square magnitude of a vector
     */
    static SqrMagnitude(pos) {
        return pos.x * pos.x + pos.y * pos.y;
    }
    /**
     * Gets the squared distance between 2 vectors
     */
    static SqrDistance(pos1, pos2) {
        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        return dx * dx + dy * dy;
    }
    /**
     * Normalizes the vector
     */
    static Normalize(dir) {
        const mag = Vector2.Magnitude(dir);
        if (mag !== 0) {
            return new Vector2(dir.x / mag, dir.y / mag);
        }
        else {
            return new Vector2(0, 0);
        }
    }
}
export class Mathf {
    /**
     * Clamps a number between a minimum and maximum number
     */
    static Clamp(value, min, max) {
        if (value >= min && value <= max)
            return value;
        if (value >= max)
            return max;
        return min;
    }
    /**
     * Linearly interpolates a Number to a Number by a Number
     */
    static Lerp(a, b, tParam) {
        return a + (b - a) * tParam;
    }
    /**
     * Gets the absolute of a value
     */
    static Abs(value) {
        if (value < 0) {
            return value * -1;
        }
        else {
            return value;
        }
    }
}
/**
 * A class used for generating random numbers.
 */
export class Random {
    /**
     * Generates a random number from a given range.
     */
    static Range(min, max) {
        return Mathf.Lerp(min, max, Math.random());
    }
}
/**
 * Generates an array of Vector3s with the first Vector being the minimum Vectors and the second Vector being the maximum Vectors
 */
export function GetMinMax(pos1, pos2) {
    const minPos = new Vector3(0, 0, 0);
    const maxPos = new Vector3(0, 0, 0);
    if (pos1.x >= pos2.x) {
        maxPos.x = pos1.x;
        minPos.x = pos2.x;
    }
    else {
        minPos.x = pos1.x;
        maxPos.x = pos2.x;
    }
    if (pos1.y >= pos2.y) {
        maxPos.y = pos1.y;
        minPos.y = pos2.y;
    }
    else {
        minPos.y = pos1.y;
        maxPos.y = pos2.y;
    }
    if (pos1.z >= pos2.z) {
        maxPos.z = pos1.z;
        minPos.z = pos2.z;
    }
    else {
        minPos.z = pos1.z;
        maxPos.z = pos2.z;
    }
    return [minPos, maxPos];
}
