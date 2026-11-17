FROM maven:3.9.9-eclipse-temurin-21 AS build

WORKDIR /build
COPY pom.xml .
RUN mvn -C -B dependency:go-offline

COPY src ./src
RUN mvn -C -B clean package -DskipTests

FROM eclipse-temurin:21-jre

WORKDIR /app
COPY --from=build /build/target/*.jar app.jar
RUN mkdir -p /app/uploads

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
