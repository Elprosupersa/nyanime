import pytest
from queue import Queue
from src.watcher import AnimeFileHandler

class DummyEvent:
    def __init__(self, src_path=None, dest_path=None, is_directory=False):
        self.src_path = src_path
        self.dest_path = dest_path
        self.is_directory = is_directory

@pytest.fixture
def handler_and_queue():
    q = Queue()
    handler = AnimeFileHandler([".mkv", ".mp4"], q)
    return handler, q

def test_ignore_hidden_and_part_files(handler_and_queue):
    handler, q = handler_and_queue
    
    assert not handler._is_valid_file("/fake/.hidden.mkv")
    assert not handler._is_valid_file("/fake/anime_01.mkv.part")
    assert not handler._is_valid_file("/fake/anime_01.mkv.download")
    assert not handler._is_valid_file("/fake/anime_01.avi") # Not in allowed list

def test_accept_valid_files(handler_and_queue):
    handler, q = handler_and_queue
    
    assert handler._is_valid_file("/fake/anime_01.mkv")
    assert handler._is_valid_file("/fake/anime_01.MP4")

def test_on_closed_valid_file(handler_and_queue):
    handler, q = handler_and_queue
    event = DummyEvent(src_path="/fake/anime_01.mkv")
    
    handler.on_closed(event)
    assert q.qsize() == 1
    assert q.get() == "/fake/anime_01.mkv"

def test_on_closed_ignores_directory(handler_and_queue):
    handler, q = handler_and_queue
    event = DummyEvent(src_path="/fake/directory", is_directory=True)
    
    handler.on_closed(event)
    assert q.qsize() == 0

def test_on_moved_valid_file(handler_and_queue):
    handler, q = handler_and_queue
    event = DummyEvent(dest_path="/fake/anime_02.mp4")
    
    handler.on_moved(event)
    assert q.qsize() == 1
    assert q.get() == "/fake/anime_02.mp4"
