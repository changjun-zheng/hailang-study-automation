package com.example;

/**
 * 百分制成绩转化为等级制成绩。
 */
public class ConvertScore {

    public String hundredToGrade(int score) throws Exception {
        if (score > 100 || score < 0) {
            throw new Exception("输入成绩无效！");
        }
        if (score >= 85) {
            return "A";
        } else if (score < 85 && score >= 70) {
            return "B";
        } else if (score < 70 && score >= 60) {
            return "C";
        } else {
            return "D";
        }
    }
}
