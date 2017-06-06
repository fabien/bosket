// @flow

import { css, array, tree } from "../tools"
import { selectionStrategies, foldStrategies, clickStrategies } from "./strategies"
import { defaults } from "./defaults"

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
//  Boilerplate  for framework class adapters

class Core<Input: Object> {
    inputs: { get: () => Input }
    outputs: Object
    state: { get: () => Object, set: Object => void }
    refresh: () => void

    constructor(inputs: { get: () => Input }, outputs: Object, state: { get: () => Object, set: Object => void }, refresh: () => void) {
        this.inputs = inputs
        this.outputs = outputs
        this.state = state
        this.refresh = refresh
    }

}

/* -------------------------------------------------------------------------- */
/* TREE NODE */

export type TreeNodeInput = {
    model:              Object[],
    category:           string,
    selection:          Object[],
    onSelect:           (item: Object, ancestors: Object[], neighbours: Object[]) => void,
    ancestors:          Object[],
    strategies?:        Object,
    disabled?:          Object => boolean,
    dragndrop:          Object,
    css:                { [key: string]: string },
    async?:             (mixed => Promise<Object[]>) => Promise<Object[]>,
    depth?:             number
}

export class TreeNode extends Core {

    /* Various checks */

    isSelected = (item: Object) => array(this.inputs.get().selection).contains(item)
    isFolded = (item: Object) : boolean => {
        const strats = this.inputs.get().strategies
        return  (!this.inputs.get().searched || this.isAsync(item)) &&
                    (strats && strats.fold || [])
                        .map(strat => (foldStrategies[strat] || strat).bind(this))
                            .reduce((last, curr) => last && curr(item, last), true)
    }
    hasChildren = (item: Object) => item[this.inputs.get().category] && item[this.inputs.get().category] instanceof Array
    isAsync = (item: ?Object) : boolean => !!item && [this.inputs.get().category] && typeof item[this.inputs.get().category] === "function"
    isDisabled= (item: Object) => {
        const disabledFun = this.inputs.get().disabled
        return disabledFun ? disabledFun(item) : false
    }
    isDraggable = (item: ?Object) =>
        item &&
        this.inputs.get().dragndrop.draggable && (
        typeof this.inputs.get().dragndrop.draggable === "function" ?
            this.inputs.get().dragndrop.draggable(item) :
            true
        )
    isDroppable = (item: ?Object) =>
        this.inputs.get().dragndrop.droppable && (
        typeof this.inputs.get().dragndrop.droppable === "function" ?
            this.inputs.get().dragndrop.droppable(item) :
            true
        )

    /* Styles calculation */

    // Css mixin helper
    mixCss = (prop: string) => this.inputs.get().css[prop] || defaults.css[prop]

    ulCss = () =>
        css.classes({
            [`${this.mixCss("depth")}-${this.inputs.get().depth || 0}`]: true
        })

    liCss = (item: Object) =>
        css.classes({
            [this.mixCss("selected")]:  this.isSelected(item),
            [this.mixCss("category")]:  this.hasChildren(item) || this.isAsync(item),
            [this.mixCss("folded")]:    this.hasChildren(item) || this.isAsync(item) ? this.isFolded(item) : null,
            [this.mixCss("disabled")]:  this.isDisabled(item),
            [this.mixCss("async")]:     this.isAsync(item) && this.isFolded(item),
            [this.mixCss("loading")]:   this.isAsync(item) && !this.isFolded(item)
        })

    /* Promises */

    // Pending promises
    pending = []

    // Unwrap a promise and mutate the model to add the results
    unwrapPromise = (item: Object) => {
        this.pending.push(item)
        const asyncFun = this.inputs.get().async
        if(!asyncFun)
            return Promise.reject(new Error("No asyn prop."))
        else
            return asyncFun(item[this.inputs.get().category])
                .then(res => {
                    item[this.inputs.get().category] = res
                    this.refresh()
                })
                .catch(err => {
                    /* eslint-disable */
                    throw err
                    /* eslint-enable */
                })
                .then(() => this.pending = this.pending.filter(e => e !== item))
    }

    /* Events */

    // On item click
    onClick = (item: Object) =>
        (event: MouseEvent) => {
            if(this.isDisabled(item))
                return
            const strats = this.inputs.get().strategies;
            (strats && strats.click || [])
                        .map(strat => (clickStrategies[strat] || strat).bind(this))
                            .forEach(strat => strat(item, event, this.inputs.get().ancestors, this.inputs.get().model))
            this.inputs.get().onSelect(item, this.inputs.get().ancestors, this.inputs.get().model)
            event.stopPropagation()
        }

    // On opener click
    onOpener(item: Object) {
        return (event: MouseEvent) => {
            const newVal = this.state.get().unfolded.filter(i => i !== item)
            if(newVal.length === this.state.get().unfolded.length)
                newVal.push(item)
            this.state.set({ unfolded: newVal })
            event.stopPropagation()
        }
    }

    // Drag'n'drop //

    onDragStart = (item: ?Object) => (event: DragEvent) => {
        event.stopPropagation()
        this.inputs.get().dragndrop.dragStart(item, event, this.inputs.get().ancestors, this.inputs.get().model)
    }
    onDragOver = (item: ?Object) => (event: DragEvent) => {
        event.preventDefault()
        event.stopPropagation()

        if(this.dragGuard(item, event)) {
            event.dataTransfer && (event.dataTransfer.dropEffect = "none")
            css.addClass(event.currentTarget, this.mixCss("nodrop"))
            return
        }

        css.addClass(event.currentTarget, this.mixCss("dragover"))
    }
    onDragEnter = (item: ?Object) => (event: DragEvent) => {
        event.preventDefault()
        event.stopPropagation()
        // If dragging over an opener
        if(item && !this.dragGuard(item, event) && (this.hasChildren(item) || this.isAsync(item)) && css.hasClass(event.target, this.mixCss("opener"))) {
            const newVal = this.state.get().unfolded.filter(i => i !== item)
            newVal.push(item)
            this.state.set({ unfolded: newVal })
        }
    }
    onDragLeave = (event: DragEvent) => {
        event.stopPropagation()
        css.removeClass(event.currentTarget, this.mixCss("dragover"))
        css.removeClass(event.currentTarget, this.mixCss("nodrop"))
    }
    onDrop = (item: ?Object) => (event: DragEvent) => {
        event.stopPropagation()
        css.removeClass(event.currentTarget, this.mixCss("dragover"))
        css.removeClass(event.currentTarget, this.mixCss("nodrop"))
        if(this.dragGuard(item, event))
            return
        const target = item ?
            this.hasChildren(item) ?
                item :
                array(this.inputs.get().ancestors).last() :
            null
        this.inputs.get().dragndrop.onDrop(target, event)
    }

    // Guard against bad drop
    dragGuard = (item: ?Object, event: DragEvent) => {
        // Prevent drop when not droppable
        if(!this.isDroppable(item)) return false
        // If we are dragging files authorize drop
        const items = event.dataTransfer ? event.dataTransfer.items : null
        if(items && items.length > 0 && items[0].kind === "file")
            return false
        // Prevent drop on self
        const selfDrop = item && array(this.inputs.get().selection).contains(item)
        // Prevent drop on child
        const childDrop = this.inputs.get().ancestors &&
                this.inputs.get().ancestors.reduce((prev, curr) =>
                    prev || array(this.inputs.get().selection).contains(curr), false)

        return selfDrop || childDrop
    }

    getDragEvents = (item: ?Object, condition?: boolean = true) => {
        if(!condition) return {}
        const result = {
            draggable:      this.isDraggable(item),
            onDragStart:    this.isDraggable(item) && this.onDragStart(item).bind(this),
            onDragOver:     this.onDragOver(item).bind(this),
            onDragEnter:    this.onDragEnter(item).bind(this),
            onDragLeave:    this.onDragLeave.bind(this),
            onDrop:         this.isDroppable(item) && this.onDrop(item).bind(this)
        }
        for(const key in result)
            if(!result[key])
                delete result[key]
        return result
    }

}

/* -------------------------------------------------------------------------- */
/* Root node of the tree */

export type RootNodeInput = {
    model:              Object[],
    category:           string,
    selection:          Object[],
    strategies:         Object,
    css:                { [key: string]: string },
    dragndrop?:         Object,
    search?:            string => Object => boolean
}

export class RootNode extends Core {

    /* Events */

    // Keyboard modifiers list
    modifiers = {}
    onKey = function(event: KeyboardEvent) {
        this.modifiers = {
            control: event.getModifierState("Control"),
            meta: event.getModifierState("Meta"),
            shift: event.getModifierState("Shift")
        }
    }.bind(this)

    // When new element(s) are selected
    onSelect = (item: Object, ancestors: Object[], neighbours: Object[]) => {
        const selectionStrategy = this.inputs.get().strategies.selection || []
        const newSelection = selectionStrategy
                                .map(strat => (selectionStrategies[strat] || strat).bind(this))
                                    .reduce((last, curr) => curr(item, last, neighbours, ancestors), this.inputs.get().selection)
        return this.outputs.onSelect(newSelection, item, ancestors, neighbours)
    }

    // Drag start
    onDragStart = (target: Object, event: DragEvent, ancestors: Object[], neighbours: Object[]) => {
        event.dataTransfer && event.dataTransfer.setData("application/json", JSON.stringify(target))
        event.dataTransfer && (event.dataTransfer.dropEffect = "move")

        if(!array(this.inputs.get().selection).contains(target)) {
            this.onSelect(target, ancestors, neighbours)
        }
        this.outputs.onDrag(target, event, ancestors, neighbours)
    }

    // Drop event
    onDrop = (target: Object, event: DragEvent) => {
        event.preventDefault()
        const jsonData = event.dataTransfer ?
            event.dataTransfer.getData("application/json") :
            "{}"

        this.outputs.onDrop(target, jsonData ? JSON.parse(jsonData) : null, event)
    }

    // Framework input wrapper
    wrapDragNDrop = () => ({
        ...this.inputs.get().dragndrop,
        dragStart: this.onDragStart,
        onDrop: this.onDrop
    })

    // Css mixin helper
    mixCss = (prop: string) => this.inputs.get().css[prop] || defaults.css[prop]

    // Filters the tree on a search
    filterTree = (input: string) => {
        const search = this.inputs.get().search
        return !search ? null : !input.trim() ? null :
            tree(this.inputs.get().model, this.inputs.get().category)
                .treeFilter(search(input.trim()))
    }

}
