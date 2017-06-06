// @flow

export const string = (str: string) => ({
    contains: (input: string) => !!str.match(new RegExp(`.*${ input }.*`, "gi"))
})
