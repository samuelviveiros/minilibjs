const GLOBAL_OBJECT = window;

GLOBAL_OBJECT['MyApp'] = new Object();

MyApp.exceptions = new Object();

MyApp.exceptions.BaseError = class {
    DESCRIPTION = 'Base error';

    constructor(details='<no details>', ignore_description=false) {
        this.details = details;
        this.ignore_description = ignore_description;
    }

    toString() {
        if (this.ignore_description) {
            return this.details;
        } else {
            return `${this.DESCRIPTION}: ${this.details}`;
        }
    }
};

MyApp.exceptions.NamespaceNotFound = class extends MyApp.exceptions.BaseError {
    DESCRIPTION = 'Namespace not found';
};

MyApp.exceptions.InvalidClassConfig = class extends MyApp.exceptions.BaseError {
    DESCRIPTION = 'Invalid class config';
};

MyApp.exceptions.InvalidNamespace = class extends MyApp.exceptions.BaseError {
    DESCRIPTION = 'Invalid namespace';
};

MyApp.evalNamespace = function (namespace) {
    try {
        result = eval(namespace);
        if (result === undefined) {
            throw new MyApp.exceptions.NamespaceNotFound(namespace);
        }
    } catch (e) {
        let msg = e.toString();

        if (msg.includes('TypeError: Cannot read property') && msg.includes('of undefined')) {
            throw new MyApp.exceptions.NamespaceNotFound(namespace);
        } else {
            throw e;
        }
    }

    return result;
}

MyApp.createNamespace = function (namespace) {
    let object = GLOBAL_OBJECT;

    namespace.split('.').forEach(property => {
        object[property] = object[property] || new Object();
        object = object[property];
    })

    return object;
}

MyApp._prepareNamespace = function (namespace) {
    let slices = namespace.split('.');

    namespace = {
        className: slices[0],
        classPath: GLOBAL_OBJECT
    };

    if (slices.length > 1) {
        namespace.className = slices.pop();
        namespace.classPath = slices.join('.');
    }

    return namespace;
}

MyApp._parseConfig = function (config) {
    if (!config.ns
        || typeof config.ns !== 'string'
        || config.ns.includes(' ')
        || config.ns.includes('\t')
        || config.ns.includes('-')) {
        throw new MyApp.exceptions.InvalidNamespace(config.ns);
    }

    if (config.body === undefined) {
        throw 'Body of class not defined.';
    }

    // Here the method hasOwnProperty is especially useful
    // because it's the only way to verify whether constructor
    // was "overridden" to the "fake" constructor.
    if (!config.body.hasOwnProperty('constructor')) {
        throw '"fake" constructor of class not defined.';
    }
}

MyApp.Class = function (ns, body) {
    let config = { ns, body };

    MyApp._parseConfig(config);

    let namespace = MyApp._prepareNamespace(config.ns);
    let className = namespace.className;
    let classPath = MyApp.createNamespace(namespace.classPath);

    // Here we are defining the main constructor that in
    // turn will call a fake constructor.
    //eval(`classPath[className] = function ${className} (args) { this.constructor(args) }`)
    classPath[className] = new Function(
        '',
        `return function ${className} (args) { this.constructor(args) }`
    )();

    // Inheritance...
    if (typeof config.body.extend === 'string') {
        let parent = null;

        try {
            parent = MyApp.evalNamespace(config.body.extend);
        } catch (e) {
            if (e instanceof MyApp.exceptions.NamespaceNotFound) {
                throw e.toString();
            } else {
                throw e;
            }
        }

        if (parent instanceof Function) {
            classPath[className].superclass = parent.prototype;
            classPath[className].prototype = Object.create(parent.prototype);
        }
    }

    Object.assign(classPath[className].prototype, config.body);
}

MyApp.instantiate = function (classNamespace, args) {
    let cls = null;

    try {
        cls = MyApp.evalNamespace(classNamespace);
    } catch (e) {
        if (e instanceof MyApp.exceptions.NamespaceNotFound) {
            throw e.toString();
        } else {
            throw e;
        }
    }

    return new cls(args);
}


MyApp.Class('path.to.your.class.MyAwesomeClass1', {

    someProperty1: 123,

    someMethod1 () {
        return 'abc';
    },

    overrideMe () {
        console.warn('Not implemented');
    },

    constructor (args) {
        console.warn('Inside the "fake" constructor.');
        console.warn(args);
    }
});

MyApp.Class('path.to.your.class.MyAwesomeClass2', {

    extend: 'path.to.your.class.MyAwesomeClass1',

    someProperty2: 321,

    someMethod2 () {
        return 'cba';
    },

    overrideMe () {
        path.to.your.class.MyAwesomeClass2.superclass.overrideMe.call(this);
        return 'Method has been overrided.';
    },

    constructor (args) {
        console.warn('Calling the "fake" constructor parent.');
        path.to.your.class.MyAwesomeClass2.superclass.constructor.call(this, args);
    }
});

MyApp.Class('path.to.your.class.MyAwesomeClass3', {

    extend: 'path.to.your.class.MyAwesomeClass2',

    someProperty3: 213,

    someMethod3 () {
        return 'cab';
    },

    overrideMe () {
        path.to.your.class.MyAwesomeClass3.superclass.overrideMe.call(this);
        return 'Method has been overrided.';
    },

    constructor (args) {
        console.warn('Calling the "fake" constructor parent.');
        path.to.your.class.MyAwesomeClass3.superclass.constructor.call(this, args);
    }
});

let myObj1 = MyApp.instantiate(
    'path.to.your.class.MyAwesomeClass1',
    { field1: 'value1', field2: 'value2' }
);

let myObj2 = MyApp.instantiate(
    'path.to.your.class.MyAwesomeClass2',
    { field1: 'value1', field2: 'value2' }
);

let myObj3 = MyApp.instantiate(
    'path.to.your.class.MyAwesomeClass3',
    { field1: 'value1', field2: 'value2' }
);

// window.FooA = class {
//     constructor () {
//         console.info('FooA');
//     }
// }

// window.FooB = class extends window.FooA {
//     constructor () {
//         super();
//         console.info('FooB');
//     }
// }
