// @flow
const arrayRecursion = (target, source1, source2) => {
    for(const prop in source1) {
        if(source1[prop] instanceof Array && source2[prop] instanceof Array) {
            target[prop] = [ ...source1[prop], ...source2[prop] ]
        } else if(typeof source1[prop] === "object" && typeof source2[prop] === "object") {
            target[prop] = arrayRecursion(target, source1[prop], source2[prop])
        }
    }
}

export const deepMix = function<O: Object, O2: Object>(one: O, two: O2, mergeArrays: boolean = false) : O & O2 {
    const clone = { ...one, ...two }

    if(mergeArrays) {
        arrayRecursion(clone, one, two)
    }

    return clone
}
