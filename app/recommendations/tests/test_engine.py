import pytest

def recomendar_videos_por_tags(video_atual_tags, lista_todos_videos):
    recomendados = []
    for video in lista_todos_videos:
        tags_em_comum = set(video_atual_tags).intersection(set(video["tags"]))
        if len(tags_em_comum) > 0:
            recomendados.append(video["titulo"])
    return recomendados

def test_deve_recomendar_videos_com_tags_iguais():
    tags_video_assistido = ["comedia", "acao"]
    
    banco_de_videos = [
        {"titulo": "Video 1", "tags": ["comedia", "drama"]},
        {"titulo": "Video 2", "tags": ["acao", "aventura"]},
        {"titulo": "Video 3", "tags": ["comedia", "romance"]}
    ]
    
    resultado = recomendar_videos_por_tags(tags_video_assistido, banco_de_videos)
    
    assert "Video 1" in resultado
    assert "Video 3" in resultado
    assert "Video 2" in resultado
