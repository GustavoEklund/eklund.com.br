/**
 * How many values a comparison needs before it says anything: the one place the readings of the MCP server and the JSON API
 * take that number from. Below it, an answer still gives what it found, and says the sample is too small to compare.
 */
export class Sample {
  /** The fewest values in each group: four nights of five lab runs, or twenty page loads of a release. */
  static MINIMUM = 20;
  /** The fewest nights in a series before a change in it is looked for: two weeks of the lab job. */
  static SERIES_MINIMUM = 14;

  /** What an answer says about its sample: how large it is, the least it needs, and whether that is enough. */
  static of(size, minimum = Sample.MINIMUM) {
    return { size, minimum, enough: size >= minimum };
  }
}
