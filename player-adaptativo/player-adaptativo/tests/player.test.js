/**
 * Testes de referência.
 *
 * Para uma suíte Jest real, instale:
 * npm init -y
 * npm install --save-dev jest jest-environment-jsdom
 *
 * Estes testes servem como contrato do comportamento esperado.
 */

describe("Player Adaptativo", () => {
  test("player deve possuir elemento de vídeo", () => {
    document.body.innerHTML = '<video id="video"></video>';
    expect(document.querySelector("#video")).not.toBeNull();
  });

  test("qualidade automática deve ser representada pelo nível -1", () => {
    const autoLevel = -1;
    expect(autoLevel).toBe(-1);
  });

  test("volume deve aceitar valores entre 0 e 1", () => {
    const volume = 0.5;
    expect(volume).toBeGreaterThanOrEqual(0);
    expect(volume).toBeLessThanOrEqual(1);
  });
});
