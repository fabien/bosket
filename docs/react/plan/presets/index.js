import React from "react"

import explorerView from "./ExplorerView"
import menuView from "./MenuView"
import flatView from "./FlatView"

export default {
    title: "Presets",
    content:
        <p>
            Presets are higher order components wrapping and configuring a TreeView.
        </p>,
    subs: [
        explorerView,
        menuView,
        flatView
    ]
}
