/**
 * @license
 * Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */

/** options passed to document.registerElement */
interface RegisterElementOptions {
  prototype?: {
    createdCallback?: Function;

    attachedCallback?: Function;
    detachedCallback?: Function;

    attributeChangedCallback?: Function;

    _propertySetter?: Function;
    notifyPath?: Function;
  };
  extends?: string;
}
type CustomElementV0Constructor = {
  constructor(): HTMLElement
};
interface Document {
  registerElement?(tagName: string, options: RegisterElementOptions):
      CustomElementV0Constructor;
}
interface PolymerSubset {
  (): void;
  Async?: {
    //
    run(callback: Function, waitTime: number): void;
  };
  RenderStatus?: {
    //
    whenReady(cb: Function): void;
  };
}
interface Window {
  _printElementStats(): void;
  _getElementMeasures(): ElementMeasurement[];
  _summarizeRange(start: number, end: number): void;
}

interface CustomElementV1Constructor {
  new(...args: any[]): V1CustomElement;
  prototype: V1CustomElement;
}

interface V1CustomElement extends HTMLElement {
  connectedCallback?(): void;
  disconnectedCallback?(): void;
  attributeChangedCallback?(): void;

  _propertySetter?(...args: any[]): void;
  notifyPath?(...args: any[]): void;
}

interface ElementMeasurement {
  tagName: string;
  operation: string;
  elementId: number|undefined;
  duration: number;
  start: number;
  end: number;
}

type CallbackShorthand =
    'registered'|'created'|'connected'|'disconnected'|'attributeChanged'|'data';
type Ce0CallbackName = 'attachedCallback'|'detachedCallback'|
    'attributeChangedCallback'|'_propertySetter'|'notifyPath';
type Ce1CallbackName = 'connectedCallback'|'disconnectedCallback'|
    'attributeChangedCallback'|'_propertySetter'|'notifyPath';

interface Console {
  timeStamp(label: string): void;
}

(() => {
  'use strict';

  // No point without the measurement APIs we need (or polyfills thereof).
  if (!window.performance || !window.performance.mark ||
      !window.performance.measure) {
    return;
  }

  const prefix = '[WC] ';

  function makeMeasurement<R>(
      operation: CallbackShorthand, tagName: string, counter: number | null,
      cb: () => R): R {
    const counterSuffix = counter == null ? '' : ` ${counter}`;
    const startMark = `${prefix}start ${operation} ${tagName}${counterSuffix}`;
    const endMark = `${prefix}end ${operation} ${tagName}${counterSuffix}`;
    const measure = `${prefix}${operation} ${tagName}${counterSuffix}`;

    window.performance.mark(startMark);
    try {
      return cb();
    } finally {
      window.performance.mark(endMark);
      window.performance.measure(measure, startMark, endMark);
    }
  };

  const idSymbol = Symbol('id');

  const originalRegisterElement = document.registerElement;
  if (originalRegisterElement) {
    const boundRegisterElement: typeof originalRegisterElement =
        originalRegisterElement.bind(document);
    function wrappedRegisterElement(
        tagName: string, options: RegisterElementOptions) {
      const maybeProto = options.prototype;
      if (!maybeProto) {
        return boundRegisterElement(tagName, options);
      }
      const proto = maybeProto;
      let elementCounter = 0;
      const originalCreate = proto.createdCallback || (() => undefined);

      /**
       * @param name Shorthand for the CE callback.
       * @param fullName The property name of the CE callback.
       */
      function wrapCustomElementCallback(
          name: CallbackShorthand, fullName: Ce0CallbackName) {
        const original = proto[fullName] || (() => undefined);
        proto[fullName] = function(this: any) {
          const counter: number = this[idSymbol];

          return makeMeasurement(
              name, tagName, counter, () => original.apply(this, arguments));
        };
      }

      proto.createdCallback = function(this: any) {
        const counter = elementCounter++;
        this[idSymbol] = counter

        return makeMeasurement(
            'created', tagName, counter, () => originalCreate.apply(this));
      };

      wrapCustomElementCallback('connected', 'attachedCallback');
      wrapCustomElementCallback('disconnected', 'detachedCallback');
      wrapCustomElementCallback('attributeChanged', 'attributeChangedCallback');
      wrapCustomElementCallback('data', '_propertySetter');
      wrapCustomElementCallback('data', 'notifyPath');

      return makeMeasurement(
          'registered', tagName, null,
          () => boundRegisterElement(tagName, options));
    }
    document.registerElement = wrappedRegisterElement;
  }

  if (window.customElements) {
    const originalDefine = window.customElements.define;
    const boundDefine: typeof originalDefine =
        originalDefine.bind(window.customElements);

    const counterMap = new Map<string, number>();
    window['HTMLElement'] = class extends HTMLElement {
      constructor() {
        super();
        const tagName = this.tagName.toLowerCase();
        let counter = counterMap.get(tagName) || 0;
        this[idSymbol] = counter;
        counterMap.set(tagName, counter + 1);
      }
    };
    function wrappedDefineElement(
        tagName: string, constructor: CustomElementV1Constructor): void {
      let proto = constructor.prototype;
      function wrapCustomElementCallback(
          name: CallbackShorthand, fullName: Ce1CallbackName) {
        const original = proto[fullName];
        if (!original) {
          return;
        }
        proto[fullName] = function(this: any) {
          const counter: number = this[idSymbol];

          return makeMeasurement(
              name, tagName, counter, () => original.apply(this, arguments));
        };
      }
      wrapCustomElementCallback('connected', 'connectedCallback');
      wrapCustomElementCallback('disconnected', 'disconnectedCallback');
      wrapCustomElementCallback('attributeChanged', 'attributeChangedCallback');
      wrapCustomElementCallback('data', '_propertySetter');
      wrapCustomElementCallback('data', 'notifyPath');
      counterMap.set(tagName.toLowerCase(), 0);

      return makeMeasurement(
          'registered', tagName, null, () => boundDefine(tagName, constructor));
    }

    window.customElements.define = wrappedDefineElement;
  }

  //
  // Polymer-specific patching
  //

  let _Polymer: (PolymerSubset|undefined);
  let _PolymerCalled = false;
  let _PolymerWrapper: PolymerSubset = function(this: {}) {
    if (!_PolymerCalled) {
      _PolymerCalled = true;

      // TODO(rictic): when incorporating zones, will need to patch
      //     Polymer.Async and Polymer.RenderStatus.whenReady
    }
    if (_Polymer) {
      return _Polymer.apply(this, arguments);
    }
  };

  // replace window.Polymer with accessors so we can wrap calls to
  //     Polymer()
  Object.defineProperty(window, 'Polymer', {
    set: function(p) {
      if (p !== _PolymerWrapper) {
        console.timeStamp('Polymer defined');
        _Polymer = p;
        if (typeof p === 'function') {
          // Overwrite this getter/setter with just the newly set value.
          Object.defineProperty(window, 'Polymer', {
            value: _PolymerWrapper,
            configurable: true,
            writable: true,
            enumerable: true
          });
        }
      }
    },
    get: function() {
      return _Polymer;
    },
    configurable: true,
    enumerable: true
  });


  window._getElementMeasures = function getElementMeasures():
      ElementMeasurement[] {
        const rawMeasures: PerformanceEntry[] =
            window.performance.getEntriesByType('measure');
        return rawMeasures.filter(m => m.name.startsWith(prefix)).map((m) => {
          const [, operation, tagName, elementId] = m.name.split(' ');
          return {
            tagName,
            operation,
            elementId: elementId == null ? undefined : parseInt(elementId, 10),
            duration: m.duration,
            start: m.startTime,
            end: m.startTime + m.duration
          };
        });
      }

  class ElementAverage {
    count = 0;
    durations = new Map<string, Map<string, [number, number]>>();

    record(measurement: ElementMeasurement) {
      if (!this.durations.has(measurement.tagName)) {
        this.durations.set(measurement.tagName, new Map());
      }
      const k = this.durations.get(measurement.tagName)!;
      if (!k.has(measurement.operation)) {
        k.set(measurement.operation, [0, 0]);
      }
      const countAndTotal = k.get(measurement.operation)!;
      countAndTotal[0]++;
      countAndTotal[1] += measurement.duration;
    }

    getTable() {
      return Array.from(this.durations.entries()).map(([tag, map]) => {
        const result = {
          tag,
          register: 0,
          'register total': 0,
          'register avg': 0,
          create: 0,
          'create total': 0,
          'create avg': 0,
          attached: 0,
          'attached total': 0,
          'attached avg': 0,
          attributeChanged: 0,
          'attributeChanged total': 0,
          'attributeChanged avg': 0,
        };
        for (let entry of map.entries()) {
          const key = entry[0];
          const count = entry[1][0];
          const total = entry[1][1];

          result[key] = count;
          result[`${key} total`] = total;
          result[`${key} avg`] = total / count;
        }
        return result;
      });
    }
  }

  window._printElementStats = () => {

    const measures = window._getElementMeasures();
    const averager = new ElementAverage();

    for (let measure of measures) {
      averager.record(measure);
    }
    console.table(averager.getTable());
  };

  window._summarizeRange = function(
      start: number, end: number, threshold = 0.5) {
    const inRange = window._getElementMeasures().filter(
        m => m.start >= start && m.end <= end);
    const operations = [
      'created', 'connected', 'disconnected', 'registered', 'data',
      'attributeChanged'
    ];
    inRange.sort((a, b) => a.duration - b.duration);
    for (let m of inRange) {
      if (m.duration < threshold) {
        continue;
      }
      console.log(`${m.operation} ${m.tagName} – ${m.duration.toFixed(2)}`);
    }
    for (let operation of operations) {
      const duration = inRange.reduce(
          (v, m) => v + (m.operation === operation ? m.duration : 0), 0);
      if (duration > 1) {
        console.log(`Total ${operation} time: ${duration.toFixed(2)}`);
      }
    }
  };

  // Listen for requests for timing data
  window.addEventListener('message', function(event) {
    if (event.data.messageType &&
        (event.data.messageType === 'get-element-stats' ||
         event.data.messageType === 'clear-element-stats')) {
      if (event.data.messageType === 'clear-element-stats') {
        window.performance.clearMarks();
        window.performance.clearMeasures();
      }

      event.source.postMessage(
          {messageType: 'element-stats', data: window._getElementMeasures()},
          '*');
    }
  });
})();
