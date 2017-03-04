if (!NGN) {
  console.error('NGN not found.')
} else {
  window.NGNX = window.NGNX || {}

  /**
   * @class NGNX.ViewRegistry
   * A view registry is an organizational collection/grouping of events and
   * references that form the basis of a visual component. It is used to
   * break large applications into structured components that make sense to a
   * human being.
   *
   * NGN provides a global event bus and global references to DOM elements,
   * which are easy to understand when there are only a few. However; the
   * sheer volume of events and references in a larger application can make
   * the code base difficult to understand. View Registries provide a way to
   * group events/references in a logical and organized way.
   *
   * View Registries inherit the functionality of the NGX.Driver, which
   * automatically applies the #namespace to event names. This is an important
   * concept in understanding how event names are constructed/managed.
   *
   * **Example:**
   *
   * ```js
   * let myReg = new NGNX.ViewRegistry({
   *   namespace: 'mycomponent.',
   *   selector: 'body main .mycomponent'
   * })
   *
   * myReg.forward('some.event', 'another.event')
   *
   * // Generic event handler
   * NGN.BUS.on('another.event', function (data) {
   *   console.log(data)
   * })
   *
   * // Fire an event
   * NGN.BUS.emit('mycomponent.some.event', data) // This is equivalent to the line below.
   * myReg.emit('some.event', data) // This is the equivalent of the line above.
   * ```
   *
   * In this example, the NGN.BUS fires an event recognized by the view registry,
   * called `mycomponent.some.event`. This is forwarded to a generic event called
   * `another.event`, which gets logged to the console.
   *
   * The view registry automatically applies the namespace, called `mycomponent.`,
   * to each event it triggers/handles. This is why `myReg.emit('some.event', data)`
   * actually fires `mycomponent.some.event`. This is also why the `myReg.forward()`
   * is passed `some.event` instead of `mycomponent.some.event`.
   * @extends NGNX.Driver
   */
  class ViewRegistry2 extends NGNX.Driver {
    constructor (cfg) {
      cfg = cfg || {}

      // Require an object for the configuration
      if (typeof cfg !== 'object') {
        throw new Error(`Invalid configuration. Expected Object, received ${typeof cfg}.`)
      }

      // Make sure the selector has been defined.
      if (!cfg.hasOwnProperty('selector')) {
        throw new Error('Missing required configuration attribute: selector')
      }

      // Inherit from parent
      if (cfg.hasOwnProperty('parent')) {
        if (document.querySelector(cfg.parent.selector) === null) {
          throw new Error('Parent component could not be found.')
        } else {
          cfg.selector = cfg.parent.selector + ' ' + cfg.selector
        }

        // Prepend namespace
        if (cfg.hasOwnProperty('namespace')) {
          if (cfg.parent.scope !== null) {
            cfg.namespace = cfg.parent.scope + cfg.namespace
          }
        } else if (cfg.parent.scope) {
          cfg.namespace = cfg.parent.scope
        }
      }

      // If there are references, scope them according to the selector.
      if (cfg.hasOwnProperty('references')) {
        Object.keys(cfg.references).forEach((r) => {
          cfg.references[r] = `${cfg.selector} ${cfg.references[r]}`
        })
      }

      let element = document.querySelector(cfg.selector)

      if (element === null) {
        throw new Error(`Could not find valid DOM element for '${cfg.selector}'`)
      }

      // Initialize the NGNX.Driver
      super(cfg)

      /**
       * @cfg {NGNX.ViewRegistry} [parent]
       * The parent View Registry. This optional configuration is commonly used
       * to break large registries into smaller/more managable registries.
       */
      Object.defineProperties(this, {
        /**
         * @cfg {string} selector (required)
         * The CSS selector string of the DOM element to manage. This is used
         * as the "root" of all NGN references & events.
         */
        selector: NGN.const(cfg.selector),

        /**
         * @cfg {NGNX.ViewRegistry} parent
         * A parent registry. This identifies the view registry
         * as a child of another.
         */
        _parent: NGN.privateconst(NGN.coalesce(cfg.parent)),

        /**
         * @cfg {Object} properties
         * Specify the properties of the registry. Properties
         */
        propertyFields: NGN.private(NGN.coalesce(cfg.properties)),

        _properties: NGN.private(null),

        /**
         * @cfg {Object} [states]
         * Define what happens in each state. This is a key/value object
         * where the key represents the name/identifier of the state (string)
         * and the value is a function. The function receives a single argument,
         * the state change object. This object contains the old and new state.
         *
         * **Example**
         *
         * ```js
         * let Registry = new NGNX.ViewRegistry({
         *   namespace: 'myscope.',
         *   selector: '.path .to element',
         *   references: {
         *     connectionIndicator: '#indicator',
         *     description: 'body > .description'
         *   },
         *   properties: {
         *     online: Boolean,
         *     description: {
         *       type: String,
         *       default: 'No description available.'
         *     }
         *   },
         *   states: {
         *     default: (stateChange) => {
         *       this.properties.description = 'Unknown'
         *     },
         *
         *     offline: (stateChange) => {
         *       if (stateChange.old !== 'offline') {
         *         this.properties.description = 'No connection established.'
         *       }
         *
         *       this.ref.connectionIndicator.classList.remove('online')
         *     },
         *
         *     online: (stateChange) => {
         *       if (stateChange.new === 'online') {
         *         this.properties.description = 'Connection established to remote server.'
         *       }
         *
         *       this.ref.connectionIndicator.classList.add('online')
         *     }
         *   },
         *   initialState: 'offline'
         * })
         *
         * Registry.on('property.change', (change) => {
         *   if (change.property === 'description') {
         *     this.ref.description.innerHTML = change.new
         *   }
         * })
         *
         * // Change the state to "online"
         * Registry.state = 'online'
         *
         * console.log(Registry.state) // Outputs "online"
         *
         * // Change the state back to "offline" after 3 seconds
         * setTimeout(() => {
         *   Registry.state = 'offline'
         * }, 3000)
         * ```
         */
        _states: NGN.private(NGN.coalesce(cfg.states, {})),

        _state: NGN.private('default'),

        displaystate: NGN.private(null),

        /**
         * @cfg {string} [initialState=default]
         * Specify the initial state of the registry.
         */
        initialstate: NGN.private(NGN.coalesce(cfg.initialState, cfg.initialstate, 'default')),

        /**
         * @cfg {Object} [reactions]
         * Map #parent states to the registry #states. This can be used to
         * automatically cascade state changes throughout a view.
         *
         * **Example**
         *
         * ```js
         * let Registry = new NGNX.ViewRegistry({
         *   parent: MyParentViewRegistry,
         *   namespace: 'myscope.',
         *   selector: '.path .to element',
         *   references: {
         *     connectionIndicator: '#indicator',
         *     description: 'body > .description'
         *   },
         *   properties: {
         *     online: Boolean,
         *     description: {
         *       type: String,
         *       default: 'No description available.'
         *     }
         *   },
         *   states: {
         *     default: (stateChange) => {
         *       this.properties.description = 'Unknown'
         *     },
         *
         *     offline: (stateChange) => {
         *       if (stateChange.old !== 'offline') {
         *         this.properties.description = 'No connection established.'
         *       }
         *
         *       this.ref.connectionIndicator.classList.remove('online')
         *     },
         *
         *     online: (stateChange) => {
         *       if (stateChange.new === 'online') {
         *         this.properties.description = 'Connection established to remote server.'
         *       }
         *
         *       this.ref.connectionIndicator.classList.add('online')
         *     }
         *   },
         *   initialState: 'offline',
         *   reactions: {
         *     connected: 'online',
         *     disconnected: 'offline'
         *   }
         * })
         *
         * MyParentViewRegistry.state = 'connected'
         *
         * console.log(Registry.state) // Outputs "online"
         * ```
         *
         * In this example, setting the #parent state to `connected`
         * is detected by `Registry`, which reacts by setting its own
         * state to `online`.
         */
        _reactions: NGN.private(NGN.coalesce(cfg.reactions))
      })

      // Assure a default state method exists
      if (!this._states.hasOwnProperty('default')) {
        this._states['default'] = () => {} // No-op default
      }

      // Create a self reference by Driver ID (inherited)
      NGN.ref.create(this.id, this.selector)

      // Initialize the properties store
      if (this.propertyFields !== null) {
        this._properties = (new NGN.DATA.Model({
          fields: this.propertyFields
        })())

        this._properties.on('field.update', (change) => {
          this.emit('property.changed', {
            property: change.field,
            old: change.old,
            new: change.new
          })
        })

        this._properties.on('field.create', (change) => {
          this.emit('property.changed', {
            property: change.field,
            old: null,
            new: NGN.coalesce(this._properties[change.field])
          })
        })

        this._properties.on('field.delete', (change) => {
          this.emit('property.changed', {
            property: change.field,
            old: change.value,
            new: null
          })
        })
      }

      // Watch the parent, if it exists.
      if (this._parent) {
        // If a parent exists, bubble state & property events down the chain.
        this._parent.on('state.changed', (state) => {
          this.emit('parent.state.changed', state)
        })

        this._parent.on('property.changed', (change) => {
          this.emit('parent.property.changed', change)
        })
      }

      // React to changes in the parent view.
      this.on('parent.state.changed', (state) => {
        if (this.managesReaction(state.new)) {
          this.state = this.reactions[state.new]
        }
      })

      // Apply scope warnings to all state handlers
      for (let scope in this._states) {
        let handlerFn = this._states[scope]
        this._states[scope] = (change) => {
          try {
            handlerFn.apply(this, arguments)
          } catch (e) {
            let fnString = handlerFn.toString().toLowerCase()
            if (fnString.indexOf('this.') >= 0 && fnString.indexOf('function') < 0) {
              console.warn(`The %c${scope}%c state handler on line ${NGN.stack.pop().line} references the lexical %c\"this\"%c scope, which may be the cause of the error if the handler is defined as a fat arrow function. This can be resolved by using a real function instead of a fat arrow function.`, NGN.css, 'font-weight: 100;', NGN.css, 'font-weight: 100;')
            }

            throw e
          }
        }
      }

      // Apply state changes
      this.on('state.changed', (change) => {
        this._states[NGN.coalesce(change.new, 'default')].apply(this, arguments)
      })

      // Set the initial state.
      if (this.initialstate !== this._state && this.managesState(this.initialstate)) {
        NGNX.util.requeue(() => {
          this.state = this.initialstate
        })
      }
    }

    /**
     * @property {NGN.ref} element
     * The NGN reference to the DOM #selector DOM element.
     * @readonly
     */
    get self () {
      return NGN.ref[this.id]
    }

    /**
     * @property {Object} reactions
     * Retrieve the reactions defined in the configuration.
     * @readonly
     */
    get reactions () {
      return NGN.coalesce(this._reactions, {})
    }

    /**
     * @property {String} state
     * The current state of the view registry.
     */
    get state () {
      return NGN.coalesce(this._state, 'default')
    }

    /**
     * @event state.changed
     * Fired when the state changes. Handlers of this event will be
     * provided an object containing the old and new state:
     *
     * ```js
     * {
     *   old: 'old_state',
     *   new: 'new_state'
     * }
     * ```
     */
    set state (value) {
      // If there is no change, don't update the state.
      if (this.state === value) {
        return
      }

      let old = this.state
      this._state = value.toString().trim().toLowerCase()

      this.emit('state.changed', {
        old: old,
        new: this._state
      })

      old = null // Facilitate garbage collection
    }

    /**
     * @property {NGN.DATA.Model} properties
     * A reference to the properties of the registry.
     * @readonly
     */
    get properties () {
      if (this._properties === null) {
        console.warn('Registry properties were requested, but none are configured.')
        return {}
      }

      return this._properties
    }

    /**
     * @method managesState
     * Indicates the view registry manages a specific state.
     * @param {string} state
     * The name of the state to check for.
     * returns {boolean}
     * @private
     */
    managesState (state) {
      return this._states.hasOwnProperty(state) && typeof this._states[state] === 'function'
    }

    /**
     * @method managesReaction
     * Indicates the view registry manages a specific parent-child reaction.
     * @param {string} parentState
     * The name of the parent state to check for.
     * returns {boolean}
     * @private
     */
    managesReaction (state) {
      return this.reactions.hasOwnProperty(state)
    }

    /**
     * @method createReaction
     * Add a new #reaction mapping dynamically.
     * @param {string} parentState
     * The parent state to react to.
     * @param {string} reactionState
     * The state to set when the parentState is recognized.
     */
    createReaction (source, target) {
      if (!this._parent) {
        console.warn('Cannot create a reaction to a parent view registry when no parent is configured.')
        return
      }

      this._reactions[source] = target
    }

    /**
     * @method removeReaction
     * Remove a #reaction mapping dynamically.
     * @param {string} parentState
     * The parent state.
     */
    removeReaction (source) {
      if (this.reactions.hasOwnProperty(source)) {
        delete this._reactions[source]
      }
    }

    /**
     * @method clearReactions
     * Remove all reactions.
     */
    clearReactions () {
      this._reactions = null
    }

    /**
     * @method destroy
     * Destroy the DOM element associated with the ViewRegistry.
     * This does not affect any parent elements.
     */
    destroy () {
      if (!NGN.hasOwnProperty('DOM')) {
        throw new Error('NGN.DOM is required to invoke the destroy method.')
      }

      NGN.DOM.destroy(this.self)
    }

    /**
     * @method hide
     * A helper method to hide the primary reference.
     * This is accomplished by setting `display: none;`
     * on the component matching the main #selector.
     * The original `display` value is saved so the #show
     * method can redisplay the element correctly.
     */
    hide () {
      this.displaystate = this.self.styles.display
      this.self.styles.display = 'none'
    }

    /**
     * @method show
     * A helper method to show the primary reference.
     * This is accomplished by setting `display: <ORIGINAL_VALUE>;`
     * on the component matching the main #selector. The original
     * value is saved by the #hide method. If this method is called
     * _before_ #hide is called, the display will be set to `''`.
     */
    show () {
      this.self.styles.display = NGN.coalesce(this.displaystate, '')
    }
  }

  NGNX.ViewRegistry2 = ViewRegistry2
  // Object.defineProperty(NGNX, 'ViewRegistry', NGN.const(ViewRegistry))
}
