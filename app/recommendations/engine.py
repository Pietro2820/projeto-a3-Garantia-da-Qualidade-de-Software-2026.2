def calcular_jaccard(tags_video_1, tags_video_2):
    set1 = set(tags_video_1)
    set2 = set(tags_video_2)

    if not set1 and not set2:
        return 0.0

    intersecao = len(set1.intersection(set2))
    uniao = len(set1.union(set2))

    return float(intersecao) / uniao

def recomendar_videos_por_jaccard(video_atual_tags, lista_todos_videos, limite_minimo=0.1):
    recomendados = []
    for video in lista_todos_videos:
        nota = calcular_jaccard(video_atual_tags, video["tags"])
        if nota >= limite_minimo:
            recomendados.append({
                "titulo": video["titulo"],
                "score": round(nota, 2)
            })
    recomendados.sort(key=lambda x: x["score"], reverse=True)
    return [v["titulo"] for v in recomendados]