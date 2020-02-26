const GLOBAL_OBJECT = window;

Object.defineProperty(GLOBAL_OBJECT, 'defineConst', {
  value: function (target, constName, value) {
    Object.defineProperty(target, constName, {
      value: value,
      writable: false,
      enumerable: true,
      configurable: false
    });
  },
  writable: false,
  enumerable: true,
  configurable: false
});

Object.defineProperty(GLOBAL_OBJECT, 'defineConsts', {
  value: function (target, constants) {
    //
    // Solução mais simples:
    //
    // for (const constName in constants) {
    //     defineConst(target, constName, constants[constName]);
    // }
    //
    // Solução mais sofisticada e talvez mais performática:
    //
    for (const constName in constants) {
      constants[constName] = {
        value: constants[constName],
        writable: false,
        enumerable: true,
        configurable: false
      }
    }

    Object.defineProperties(target, constants);
  },
  writable: false,
  enumerable: true,
  configurable: false
});

defineConst(GLOBAL_OBJECT, 'MyApp', new Object());
defineConst(MyApp, 'exceptions', new Object());

MyApp.exceptions.BaseError = class {
  constructor(description = '<no description>', ignore_name = false) {
    this.description = description;
    this.ignore_name = ignore_name;
  }

  toString() {
    if (this.ignore_name || this.NAME === undefined) {
      return this.description;
    } else {
      return `${this.NAME}: ${this.description}`;
    }
  }
};

MyApp.exceptions.NamespaceNotFound = class extends MyApp.exceptions.BaseError {
  // constructor(description = '<no description>', ignore_name = false) {
  //   super(description, ignore_name);
  //   defineConst(this, 'NAME', 'NamespaceNotFound');
  // }

  // static get NAME () { return 'NamespaceNotFound' }  // only class

  get NAME() { return 'NamespaceNotFound' }  // only instance
};

MyApp.exceptions.InvalidClassConfig = class extends MyApp.exceptions.BaseError {
  get NAME() { return 'InvalidClassConfig' }
};

MyApp.exceptions.InvalidNamespace = class extends MyApp.exceptions.BaseError {
  get NAME() { return 'InvalidNamespace' }
};

MyApp.getAllPropertyNames = function (obj) {
  var props = [];

  do {
    Object.getOwnPropertyNames(obj).forEach(function (prop) {
      if (props.indexOf(prop) === -1) {
        props.push(prop);
      }
    });
  } while (obj = Object.getPrototypeOf(obj));

  return props;
}

MyApp.getProtoChain = function (instance) {
  let prototype = instance;
  let protoChain = [];
  let allProperties = [];

  try {
    while (true) {
      prototype = Object.getPrototypeOf(prototype);
      let temp = new Object();
      let properties = Object.getOwnPropertyNames(prototype);
      temp[prototype.constructor.name] = properties;
      protoChain.push(temp);

      allProperties = [...new Set([...allProperties, ...properties])];
    }
  } finally {
    let temp = new Object();
    temp['__inherited__'] = allProperties;
    protoChain.push(temp);
    return protoChain.reverse();
  }
}

MyApp.evalNamespace = function (namespace) {
  try {
    result = eval(namespace);
    if (result === undefined) {
      throw new MyApp.exceptions.NamespaceNotFound(namespace);
    }
  } catch (e) {
    let msg = e.toString().toLowerCase();

    if (msg.includes('cannot read property') && msg.includes('of undefined')) {
      throw new MyApp.exceptions.NamespaceNotFound(namespace);
    } else {
      throw e;
    }
  }

  return result;
}

MyApp.createNamespace = function (namespace, createAsConst = true) {
  let object = GLOBAL_OBJECT;

  namespace.split('.').forEach(property => {
    if (object[property] === undefined) {
      if (createAsConst) {
        defineConst(object, property, new Object());
      } else {
        object[property] = object[property] || new Object();
      }
    }
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
    throw new MyApp.exceptions.InvalidClassConfig(`Class body not defined for ${config.ns}`);
  }

  //
  // Here the method hasOwnProperty is especially useful
  // because it's the only way to verify whether constructor
  // was "overridden" to the "fake" constructor.
  //
  // if (!config.body.hasOwnProperty('constructor')) {
  //     throw `Class "fake" constructor not defined for ${config.ns}`;
  // }
  //
  if (!config.body.hasOwnProperty('init')) {
    throw `Class 'init' method not defined for ${config.ns}`;
  }
}

MyApp.klass = function (ns, body) {
  let config = { ns, body };

  MyApp._parseConfig(config);

  let namespace = MyApp._prepareNamespace(config.ns);
  let className = namespace.className;
  let classPath = MyApp.createNamespace(namespace.classPath);

  //
  // Here we are defining the main constructor that in
  // turn will call a fake constructor.
  //
  // eval(`classPath[className] = function ${className} (args) { this.constructor(args) }`)
  //
  // let funcBody = `return function ${className} (args) { this.constructor(args) }`;
  // classPath[className] = new Function(funcBody)();
  //
  let funcBody = `return function ${className} (args) { this.init(args) }`;
  defineConst(classPath, className, new Function(funcBody)());

  // Add superclass members (inheritance).
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

  // Add constructor property.
  Object.defineProperty(classPath[className].prototype, 'constructor', {
    value: classPath[className],
    configurable: true,
    enumerable: false,
    writable: true
  });

  // Add subclass members.
  Object.assign(classPath[className].prototype, config.body);
}

MyApp.instantiate = function (classNamespace, args) {
  // let klass = null;

  // try {
  //   klass = MyApp.evalNamespace(classNamespace);
  // } catch (e) {
  //   if (e instanceof MyApp.exceptions.NamespaceNotFound) {
  //     throw e.toString();
  //   } else {
  //     throw e;
  //   }
  // }

  // return new klass(args);

  let klass = new Function(`return ${classNamespace};`)();

  return new klass(args);
}

defineConsts(MyApp.exceptions, {
  'BaseError': MyApp.exceptions.BaseError,
  'NamespaceNotFound': MyApp.exceptions.NamespaceNotFound,
  'InvalidClassConfig': MyApp.exceptions.InvalidClassConfig,
  'InvalidNamespace': MyApp.exceptions.InvalidNamespace,
});

defineConsts(MyApp, {
  'evalNamespace': MyApp.evalNamespace,
  'createNamespace': MyApp.createNamespace,
  '_prepareNamespace': MyApp._prepareNamespace,
  '_parseConfig': MyApp._parseConfig,
  'klass': MyApp.klass,
  'instantiate': MyApp.instantiate,
});


MyApp.klass('path.to.your.class.MyAwesomeClass1', {

  someProperty1: 123,

  someMethod1() {
    return 'abc';
  },

  overrideMe() {
    console.warn('Not implemented');
  },

  init(args) {
    console.warn('Inside the "fake" constructor.');
    console.warn(args);
  }
});

MyApp.klass('path.to.your.class.MyAwesomeClass2', {

  extend: 'path.to.your.class.MyAwesomeClass1',

  someProperty2: 321,

  someMethod2() {
    return 'cba';
  },

  overrideMe() {
    path.to.your.class.MyAwesomeClass2.superclass.overrideMe.call(this);
    return 'Method has been overrided.';
  },

  init(args) {
    console.warn('Calling the "fake" constructor parent.');
    // path.to.your.class.MyAwesomeClass2.superclass.constructor.call(this, args);
    path.to.your.class.MyAwesomeClass2.superclass.init.call(this, args);
  }
});

MyApp.klass('path.to.your.class.MyAwesomeClass3', {

  extend: 'path.to.your.class.MyAwesomeClass2',

  someProperty3: 213,

  someMethod3() {
    return 'cab';
  },

  overrideMe() {
    path.to.your.class.MyAwesomeClass3.superclass.overrideMe.call(this);
    return 'Method has been overrided.';
  },

  init(args) {
    console.warn('Calling the "fake" constructor parent.');
    // path.to.your.class.MyAwesomeClass3.superclass.constructor.call(this, args);
    path.to.your.class.MyAwesomeClass3.superclass.init.call(this, args);
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

window.FooA = class {
  constructor() {
    console.info('FooA');
  }
}

window.FooB = class extends window.FooA {
  constructor() {
    super();
    console.info('FooB');
  }
}
