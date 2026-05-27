export interface Subject {
  id: string;
  name: string;
  midtermWeight: number;
  finalWeight: number;
  performanceWeight: number;
}

export interface Config {
  schoolName: string;
  grade: string;
  primaryColor: string;
  secondaryColor: string;
  subjects: Subject[];
  notices: {
    id: string;
    title: string;
    date: string;
    content: string;
  }[];
}

export const APP_CONFIG: Config = {
  schoolName: "여수고등학교",
  grade: "1학년",
  primaryColor: "#1e3a8a", // navy-900
  secondaryColor: "#3b82f6", // blue-500
  subjects: [
    { id: "kor1", name: "공통국어1", midtermWeight: 30, finalWeight: 30, performanceWeight: 40 },
    { id: "math1", name: "공통수학1", midtermWeight: 30, finalWeight: 30, performanceWeight: 40 },
    { id: "eng1", name: "공통영어1", midtermWeight: 30, finalWeight: 30, performanceWeight: 40 },
    { id: "khist", name: "한국사", midtermWeight: 30, finalWeight: 30, performanceWeight: 40 },
    { id: "isoc", name: "통합사회", midtermWeight: 30, finalWeight: 30, performanceWeight: 40 },
    { id: "isci", name: "통합과학", midtermWeight: 30, finalWeight: 30, performanceWeight: 40 },
  ],
  notices: []
};
