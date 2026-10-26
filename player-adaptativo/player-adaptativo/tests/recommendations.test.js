describe("Recomendações", () => {
  test("um vídeo recomendado deve possuir título", () => {
    const video = {
      id: "demo",
      title: "Aula de exemplo"
    };

    expect(video.title).toBeTruthy();
  });
});
