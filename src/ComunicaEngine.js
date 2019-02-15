const engine = require('../lib/comunica-engine');

/**
 * Asynchronous iterator wrapper for the Comunica SPARQL query engine.
 */
export default class ComunicaEngine {
  /**
   * Create a ComunicaEngine to query the given subject.
   */
  constructor(subject, source) {
    this._subject = subject;
    this._engine = engine;
    this._source = source;
  }

  getDocument(subject) {
    return subject.value.replace(/#.*/, '');
  }

  /**
   * Creates an asynchronous iterable
   * of results for the given SPARQL query.
   */
  execute(sparql) {
    // Comunica does not support SPARQL UPDATE queries yet,
    // so we temporarily throw an error for them.
    if (sparql.startsWith('INSERT') || sparql.startsWith('DELETE'))
      return this.executeUpdate(sparql);

    // Create an iterator function that reads the next binding
    let bindings;
    const next = async () => {
      if (!bindings) {
        let sources;
        const source = await this._source;
        if (source) {
          const sourceArray = Array.isArray(source) ? await Promise.all(source) : [source];
          sources = sourceArray.map(value => ({ type: typeof value === 'string' ? 'file' : 'rdfjsSource', value }));
        }
        else {
          // Determine the document to query from the subject if there is no source
          sources = [{ type: 'file', value: this.getDocument(await this._subject) }];
        }

        // Execute the query and retrieve the bindings
        const queryResult = await this._engine.query(sparql, { sources });
        bindings = queryResult.bindingsStream;
      }
      return new Promise(readNextBinding);
    };
    return {
      next,
      [Symbol.asyncIterator]() { return this; },
    };

    // Reads the next binding
    function readNextBinding(resolve) {
      const done = () => resolve({ done: true });
      // Mark the iterator as done when the source has ended
      if (bindings.ended) {
        done();
      }
      else {
        // Wait for either the data or the end event
        bindings.once('data', data => {
          resolve({ value: data });
          bindings.removeListener('end', done);
        });
        bindings.on('end', done);
      }
    }
  }

  /**
   * Throws an error for update queries.
   */
  executeUpdate(sparql) {
    throw new Error(`Comunica does not support SPARQL UPDATE queries, received: ${sparql}`);
  }
}
