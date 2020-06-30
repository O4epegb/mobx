import {
    Atom,
    IEnhancer,
    IInterceptable,
    IEqualsComparer,
    IInterceptor,
    IListenable,
    Lambda,
    checkIfStateModificationsAreAllowed,
    comparer,
    createInstanceofPredicate,
    getNextId,
    hasInterceptors,
    hasListeners,
    interceptChange,
    isSpyEnabled,
    notifyListeners,
    registerInterceptor,
    registerListener,
    spyReport,
    spyReportEnd,
    spyReportStart,
    toPrimitive,
    globalState,
    IUNCHANGED,
    UPDATE
} from "../internal"

export interface IValueWillChange<T> {
    object: any
    type: "update"
    newValue: T
}

export interface IValueDidChange<T> extends IValueWillChange<T> {
    oldValue: T | undefined
}

export interface IObservableValue<T> {
    get(): T
    set(value: T): void
    intercept_(handler: IInterceptor<IValueWillChange<T>>): Lambda
    observe_(listener: (change: IValueDidChange<T>) => void, fireImmediately?: boolean): Lambda
}

const CREATE = "create"

export class ObservableValue<T> extends Atom
    implements IObservableValue<T>, IInterceptable<IValueWillChange<T>>, IListenable {
    hasUnreportedChange_ = false
    interceptors_
    changeListeners_
    value_
    dehancer: any

    constructor(
        value: T,
        public enhancer: IEnhancer<T>,
        public name_ = "ObservableValue@" + getNextId(),
        notifySpy = true,
        private equals: IEqualsComparer<any> = comparer.default
    ) {
        super(name_)
        this.value_ = enhancer(value, undefined, name_)
        if (__DEV__ && notifySpy && isSpyEnabled()) {
            // only notify spy if this is a stand-alone observable
            spyReport({ type: CREATE, name: this.name_, newValue: "" + this.value_ })
        }
    }

    private dehanceValue(value: T): T {
        if (this.dehancer !== undefined) return this.dehancer(value)
        return value
    }

    public set(newValue: T) {
        const oldValue = this.value_
        newValue = this.prepareNewValue_(newValue) as any
        if (newValue !== globalState.UNCHANGED) {
            const notifySpy = isSpyEnabled()
            if (__DEV__ && notifySpy) {
                spyReportStart({
                    type: UPDATE,
                    name: this.name_,
                    newValue,
                    oldValue
                })
            }
            this.setNewValue_(newValue)
            if (__DEV__ && notifySpy) spyReportEnd()
        }
    }

    private prepareNewValue_(newValue): T | IUNCHANGED {
        checkIfStateModificationsAreAllowed(this)
        if (hasInterceptors(this)) {
            const change = interceptChange<IValueWillChange<T>>(this, {
                object: this,
                type: UPDATE,
                newValue
            })
            if (!change) return globalState.UNCHANGED
            newValue = change.newValue
        }
        // apply modifier
        newValue = this.enhancer(newValue, this.value_, this.name_)
        return this.equals(this.value_, newValue) ? globalState.UNCHANGED : newValue
    }

    setNewValue_(newValue: T) {
        const oldValue = this.value_
        this.value_ = newValue
        this.reportChanged()
        if (hasListeners(this)) {
            notifyListeners(this, {
                type: UPDATE,
                object: this,
                newValue,
                oldValue
            })
        }
    }

    public get(): T {
        this.reportObserved()
        return this.dehanceValue(this.value_)
    }

    intercept_(handler: IInterceptor<IValueWillChange<T>>): Lambda {
        return registerInterceptor(this, handler)
    }

    observe_(listener: (change: IValueDidChange<T>) => void, fireImmediately?: boolean): Lambda {
        if (fireImmediately)
            listener({
                object: this,
                type: UPDATE,
                newValue: this.value_,
                oldValue: undefined
            })
        return registerListener(this, listener)
    }

    toJSON() {
        return this.get()
    }

    toString() {
        return `${this.name_}[${this.value_}]`
    }

    valueOf(): T {
        return toPrimitive(this.get())
    }

    [Symbol.toPrimitive]() {
        return this.valueOf()
    }
}

export const isObservableValue = createInstanceofPredicate("ObservableValue", ObservableValue) as (
    x: any
) => x is IObservableValue<any>
