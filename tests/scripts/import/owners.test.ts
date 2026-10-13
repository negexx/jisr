import { describe, expect, it } from "vitest";

import { OWNS } from "../../../scripts/import/owners";

describe("source ownership", () => {
  const samples: [string, string][] = [
    ["uai:0597215X", "france"],
    ["parcoursup:48592", "france"],
    ["hrk:184", "institutions"],
    ["duo:21PF", "institutions"],
    ["rio:21PF/21PF00/56984", "netherlands"],
    ["rio-unit:21PF@delft", "netherlands"],
    ["ba:73208836", "germany"],
    ["ba-provider:26324@marburg", "germany"],
    ["daad:6217", "daad"],
    ["daad-academy:srh-university@berlin", "daad"],
    ["studyfinder:116", "hungary"],
    ["studyfinder-institution:university-of-debrecen@debrecen", "hungary"],
    ["ruct:001", "spain"],
    ["ruct:001:2504059", "spain"],
  ];

  it("gives every source id to exactly one source", () => {
    for (const [id, owner] of samples) {
      const owners = Object.entries(OWNS)
        .filter(([, owns]) => owns(id))
        .map(([name]) => name);
      expect(owners, id).toEqual([owner]);
    }
  });
  it("leaves shared campus units (hrk:<nr>@<town>) to the orphan sweep, not to any source", () => {
    expect(Object.values(OWNS).some((owns) => owns("hrk:184@straubing"))).toBe(false);
  });
});
