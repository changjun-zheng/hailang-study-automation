package com.example;

import org.junit.jupiter.api.Test;

/**
 * ConvertScore 的 JUnit5 测试类。
 */
public class AppTest {

    @Test
    void testConvert() {
        int score = 90;
        ConvertScore convertScore = new ConvertScore();
        try {
            String ret = convertScore.hundredToGrade(score);
            System.out.println("考试成绩为：" + score + "分，等级成绩为：" + ret);
            score = 65;
            ret = convertScore.hundredToGrade(score);
            System.out.println("考试成绩为：" + score + "分，等级成绩为：" + ret);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
