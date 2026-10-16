package com.example;

/**
 * 工程入口：运行后打印各分数对应的等级。
 */
public class App {

    public static void main(String[] args) {
        ConvertScore convertScore = new ConvertScore();
        int[] scores = {95, 85, 84, 70, 69, 60, 59, 0};
        for (int score : scores) {
            try {
                System.out.println("考试成绩为：" + score + "分，等级成绩为：" + convertScore.hundredToGrade(score));
            } catch (Exception e) {
                System.out.println("考试成绩为：" + score + "分，" + e.getMessage());
            }
        }
    }
}
