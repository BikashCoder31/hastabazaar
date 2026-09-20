import { DatabaseSync } from 'node:sqlite';

class SQLiteD1Statement {
  values = [];

  constructor(statement) {
    this.statement = statement;
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    return this.statement.get(...this.values) ?? null;
  }

  async all() {
    return { results: this.statement.all(...this.values) };
  }

  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) }, results: [] };
  }
}

export class SQLiteD1Database {
  constructor(sqlite = new DatabaseSync(':memory:')) {
    this.sqlite = sqlite;
  }

  prepare(sql) {
    return new SQLiteD1Statement(this.sqlite.prepare(sql));
  }

  async batch(statements) {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.sqlite.close();
  }
}
