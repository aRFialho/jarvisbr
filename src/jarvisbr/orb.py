from __future__ import annotations

import queue
import tkinter as tk
from jarvisbr.events import AssistantState

STATE_LABEL={AssistantState.IDLE:"AGUARDANDO 👏👏",AssistantState.LISTENING:"OUVINDO",AssistantState.THINKING:"PROCESSANDO",AssistantState.SPEAKING:"FALANDO",AssistantState.CONFIRMING:"CONFIRMAÇÃO",AssistantState.ERROR:"ERRO"}

class OrbWindow:
    def __init__(self,on_close)->None:
        self.on_close=on_close;self.root=tk.Tk();self.root.title("Jarvis BR");self.root.geometry("260x260+40+40");self.root.configure(bg="#05070a");self.root.overrideredirect(True);self.root.attributes("-topmost",True);self.root.attributes("-alpha",0.94);self.canvas=tk.Canvas(self.root,width=260,height=260,bg="#05070a",highlightthickness=0);self.canvas.pack(fill="both",expand=True);self.queue: "queue.Queue[tuple[str,object]]"=queue.Queue();self.state=AssistantState.IDLE;self.level=0.0;self.phase=0;self._drag=(0,0);self.canvas.bind("<ButtonPress-1>",self._drag_start);self.canvas.bind("<B1-Motion>",self._drag_move);self.canvas.bind("<Button-3>",lambda _:self.close());self.root.bind("<Escape>",lambda _:self.close());self.root.after(33,self._tick)
    def set_state(self,state:AssistantState)->None:self.queue.put(("state",state))
    def set_level(self,level:float)->None:self.queue.put(("level",float(level)))
    def add_text(self,text:str)->None:print(text)
    def _tick(self)->None:
        try:
            while True:
                kind,value=self.queue.get_nowait()
                if kind=="state":self.state=value
                elif kind=="level":self.level=float(value)
        except queue.Empty:pass
        self.phase=(self.phase+1)%100;pulse=(self.phase if self.phase<=50 else 100-self.phase)/50;audio=min(self.level*350,1.0);radius=58+10*pulse+18*audio;cx=cy=130;self.canvas.delete("all")
        for extra in (34,22,10):
            r=radius+extra;self.canvas.create_oval(cx-r,cy-r,cx+r,cy+r,outline="#10384d",width=1)
        self.canvas.create_oval(cx-radius,cy-radius,cx+radius,cy+radius,outline="#67d8ff",width=3);inner=max(22,radius*0.58);self.canvas.create_oval(cx-inner,cy-inner,cx+inner,cy+inner,fill="#0a2533",outline="#8de7ff",width=2);self.canvas.create_text(cx,cy-6,text="JARVIS",fill="#d8f7ff",font=("Segoe UI",17,"bold"));self.canvas.create_text(cx,cy+21,text=STATE_LABEL[self.state],fill="#6bcfea",font=("Segoe UI",8,"bold"));self.canvas.create_text(cx,239,text="CTRL+ALT+J  •  botão direito fecha",fill="#477486",font=("Segoe UI",7));self.root.after(33,self._tick)
    def _drag_start(self,event)->None:self._drag=(event.x,event.y)
    def _drag_move(self,event)->None:self.root.geometry(f"+{self.root.winfo_x()+event.x-self._drag[0]}+{self.root.winfo_y()+event.y-self._drag[1]}")
    def close(self)->None:self.on_close();self.root.destroy()
    def run(self)->None:self.root.mainloop()
