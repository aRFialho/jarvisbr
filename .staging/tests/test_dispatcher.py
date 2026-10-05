from jarvisbr.config import Settings
from jarvisbr.dispatcher import Dispatcher
from jarvisbr.memory import Turn
from jarvisbr.base import ChatProvider
class FakeProvider(ChatProvider):
 name="fake"
 def complete(self,prompt,*,system=None,history=None):
  if system and "APENAS JSON" in system:return '{"reply":"Vou abrir.","actions":[{"tool":"open_app","args":{"name":"chrome"}}]}'
  return "Resposta de teste"
def test_local_open_app_skips_llm():
 r=Dispatcher(Settings(),FakeProvider()).dispatch("abra o chrome");assert r.actions[0].tool=="open_app";assert r.actions[0].args["name"]=="chrome"
def test_chat_uses_provider():
 r=Dispatcher(Settings(),FakeProvider()).dispatch("explique computação quântica",history=[Turn("user","oi")]);assert r.reply=="Resposta de teste";assert r.actions==[]
def test_agent_uses_json_planner():assert Dispatcher(Settings(),FakeProvider()).dispatch("abra o navegador",agent_mode=True).actions[0].tool=="open_app"
