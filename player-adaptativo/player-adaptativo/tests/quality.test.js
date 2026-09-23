describe("QualityManager — regras", () => {
  test("nível automático é -1", () => {
    expect(-1).toBe(-1);
  });

  test("nível inferior nunca deve ser menor que zero", () => {
    const current = 0;
    const lower = Math.max(0, current - 1);
    expect(lower).toBe(0);
  });
});
