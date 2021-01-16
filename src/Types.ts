import {ExtendedGeometryCollection} from 'd3';
import {Animation, ArcRotateCamera, CubicEase, EasingFunction} from '@babylonjs/core';

export interface MeshgroupData {
    boundingBox: any;
    randomPoints: any;
}

export interface GeometryCollection extends ExtendedGeometryCollection {
    length: number;
    pop;
    forEach;
    slice;
    reverse;
}

export class CustomCamera extends ArcRotateCamera {

    /**
     *
     * @param whichprop
     * @param targetval
     * @param speed
     * @return Animatable
     */
    spinTo(whichprop, targetval, speed) {
        let ease = new CubicEase();
        ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
        return Animation.CreateAndStartAnimation('at4', this, whichprop, speed, 120, this[whichprop], targetval, 0, ease);
    }
}

export interface MeshgroupData {
    boundingBox: any;
    randomPoints: any;
}

export interface GeometryCollection extends ExtendedGeometryCollection {
    length: number;
    pop;
    forEach;
    slice;
    reverse;
}
